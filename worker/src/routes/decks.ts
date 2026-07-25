import { Hono } from 'hono';
import { and, eq, inArray } from 'drizzle-orm';
import type { AppEnv } from '../auth';
import { getDb } from '../db/client';
import { allocations, cards, deckCards, decks } from '../db/schema';
import { serializeCard } from './cards';
import {
  getCardMetaForProductIds,
  getOwnedByProductId,
  loadDeckStates,
} from '../services/deckState';
import { getOwnedDeck } from '../services/scope';
import { validateDeck } from '../services/validation';
import { readJson } from '../util/json';

export const decksRoutes = new Hono<AppEnv>()
  // GET /api/decks — list with summary
  .get('/', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const states = await loadDeckStates(db, userId);
    const owned = await getOwnedByProductId(db, userId);
    const deckRows = await db.select().from(decks).where(eq(decks.userId, userId)).all();
    const metaById = new Map(deckRows.map((d) => [d.id, d] as const));

    const data = states.map((s) => {
      const mainCount = Object.values(s.required).reduce((a, b) => a + b, 0);
      const complete = isComplete(s.required, s.alloc);
      const buildable = Object.entries(s.required).every(([productId, q]) => (owned[productId] ?? 0) >= q);
      const d = metaById.get(s.deckId)!;
      return {
        id: s.deckId,
        name: s.name,
        notes: d.notes,
        isActive: s.isActive,
        resourceDeckSize: d.resourceDeckSize,
        mainCount,
        complete,
        buildable,
        updatedAt: s.updatedAt,
      };
    });
    data.sort((a, b) => Number(b.isActive) - Number(a.isActive) || b.updatedAt - a.updatedAt);
    return c.json({ data });
  })

  // POST /api/decks — create
  .post('/', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const body = await readJson<{ name: string; notes: string; resourceDeckSize: number }>(c);
    const name = (body.name ?? '').trim() || 'Nuevo deck';
    const row = await db
      .insert(decks)
      .values({
        userId,
        name,
        notes: body.notes ?? null,
        resourceDeckSize: clampInt(body.resourceDeckSize ?? 10, 0, 60),
      })
      .returning()
      .get();
    return c.json({ data: row }, 201);
  })

  // GET /api/decks/:id — detail + validation
  .get('/:id', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const id = Number(c.req.param('id'));
    const deck = await getOwnedDeck(db, userId, id);
    if (!deck) return c.json({ error: 'Deck not found' }, 404);

    const dcRows = await db.select().from(deckCards).where(eq(deckCards.deckId, id)).all();
    const allocRows = await db.select().from(allocations).where(eq(allocations.deckId, id)).all();
    const allocMap: Record<string, number> = {};
    for (const a of allocRows) allocMap[a.productId] = a.quantity;

    const productIds = dcRows.map((d) => d.productId);
    const cardsByProductId = await cardsForProductIds(db, productIds);
    const meta = await getCardMetaForProductIds(db, productIds);
    const owned = await getOwnedByProductId(db, userId);

    const validation = validateDeck(
      dcRows.map((d) => ({
        productId: d.productId,
        cardNumber: meta.get(d.productId)?.cardNumber ?? d.productId,
        quantity: d.quantity,
      })),
      deck.resourceDeckSize,
      meta,
      new Map(Object.entries(owned)),
    );

    const cardsOut = dcRows
      .map((d) => ({
        productId: d.productId,
        quantity: d.quantity,
        owned: owned[d.productId] ?? 0,
        allocated: allocMap[d.productId] ?? 0,
        card: cardsByProductId.get(d.productId) ?? null,
      }))
      .sort((a, b) => cardSortKey(a.card).localeCompare(cardSortKey(b.card)));

    return c.json({
      data: {
        ...deck,
        cards: cardsOut,
        validation,
        complete: isComplete(
          Object.fromEntries(dcRows.map((d) => [d.productId, d.quantity])),
          allocMap,
        ),
      },
    });
  })

  // PUT /api/decks/:id — update metadata
  .put('/:id', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const id = Number(c.req.param('id'));
    const owned = await getOwnedDeck(db, userId, id);
    if (!owned) return c.json({ error: 'Deck not found' }, 404);

    const body = await readJson<{ name: string; notes: string; resourceDeckSize: number }>(c);
    const patch: Record<string, unknown> = { updatedAt: Math.floor(Date.now() / 1000) };
    if (body.name !== undefined) patch.name = body.name.trim() || 'Deck';
    if (body.notes !== undefined) patch.notes = body.notes;
    if (body.resourceDeckSize !== undefined) patch.resourceDeckSize = clampInt(body.resourceDeckSize, 0, 60);
    const row = await db
      .update(decks)
      .set(patch)
      .where(and(eq(decks.id, id), eq(decks.userId, userId)))
      .returning()
      .get();
    if (!row) return c.json({ error: 'Deck not found' }, 404);
    return c.json({ data: row });
  })

  // DELETE /api/decks/:id
  .delete('/:id', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const id = Number(c.req.param('id'));
    const owned = await getOwnedDeck(db, userId, id);
    if (!owned) return c.json({ error: 'Deck not found' }, 404);
    await db.delete(decks).where(and(eq(decks.id, id), eq(decks.userId, userId)));
    return c.json({ ok: true });
  })

  // PUT /api/decks/:id/cards — set a specific printing quantity (0 removes)
  .put('/:id/cards', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const id = Number(c.req.param('id'));
    const owned = await getOwnedDeck(db, userId, id);
    if (!owned) return c.json({ error: 'Deck not found' }, 404);

    const body = await readJson<{ productId: string; quantity: number }>(c);
    const productId = (body.productId ?? '').trim();
    if (!productId) return c.json({ error: 'productId required' }, 400);
    const quantity = clampInt(body.quantity ?? 0, 0, 99);
    const now = Math.floor(Date.now() / 1000);

    if (quantity <= 0) {
      await db
        .delete(deckCards)
        .where(and(eq(deckCards.deckId, id), eq(deckCards.productId, productId)));
      await db
        .update(decks)
        .set({ updatedAt: now })
        .where(and(eq(decks.id, id), eq(decks.userId, userId)));
      return c.json({ productId, quantity: 0 });
    }
    const card = await db
      .select({ productId: cards.productId })
      .from(cards)
      .where(eq(cards.productId, productId))
      .get();
    if (!card) return c.json({ error: 'Card printing not found' }, 404);
    await db
      .insert(deckCards)
      .values({ deckId: id, productId, quantity })
      .onConflictDoUpdate({ target: [deckCards.deckId, deckCards.productId], set: { quantity } });
    await db
      .update(decks)
      .set({ updatedAt: now })
      .where(and(eq(decks.id, id), eq(decks.userId, userId)));
    return c.json({ productId, quantity });
  });

function isComplete(required: Record<string, number>, alloc: Record<string, number>): boolean {
  const keys = Object.keys(required);
  if (keys.length === 0) return false;
  return keys.every((cn) => (alloc[cn] ?? 0) >= required[cn]);
}

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(Number(n) || 0)));
}

async function cardsForProductIds(db: ReturnType<typeof getDb>, productIds: string[]) {
  const map = new Map<string, ReturnType<typeof serializeCard>>();
  if (productIds.length === 0) return map;
  const rows = await db
    .select()
    .from(cards)
    .where(inArray(cards.productId, productIds))
    .all();
  for (const r of rows) map.set(r.productId, serializeCard(r));
  return map;
}

function cardSortKey(card: ReturnType<typeof serializeCard> | null): string {
  if (!card) return 'zzz';
  return `${card.cardType ?? 'z'}-${String(card.cost ?? 99).padStart(2, '0')}-${card.name}`;
}
