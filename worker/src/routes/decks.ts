import { Hono } from 'hono';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { AppEnv } from '../auth';
import { getDb } from '../db/client';
import { allocations, cards, deckCards, decks } from '../db/schema';
import { serializeCard } from './cards';
import {
  aggregateOwnedByCardNumber,
  getCardMetaForCardNumbers,
  getOwnedByProductId,
  getPrintingsByCardNumber,
  getProductIdToCardNumberMap,
  isDeckBuildable,
  isDeckComplete,
  loadDeckStates,
} from '../services/deckState';
import { sumAllocatedForCardNumber } from '../services/allocation';
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
    const cardNumbers = [...new Set(states.flatMap((s) => Object.keys(s.required)))];
    const printingsByCardNumber = await getPrintingsByCardNumber(db, cardNumbers);

    const data = states.map((s) => {
      const mainCount = Object.values(s.required).reduce((a, b) => a + b, 0);
      const complete = isDeckComplete(s.required, s.alloc, printingsByCardNumber);
      const buildable = isDeckBuildable(s.required, owned, printingsByCardNumber);
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

    const cardNumbers = dcRows.map((d) => d.cardNumber);
    const printingsByCardNumber = await getPrintingsByCardNumber(db, cardNumbers);
    const meta = await getCardMetaForCardNumbers(db, cardNumbers);
    const ownedByProduct = await getOwnedByProductId(db, userId);
    const productIdToCardNumber = await getProductIdToCardNumberMap(db, Object.keys(ownedByProduct));
    const ownedByCardNumber = aggregateOwnedByCardNumber(ownedByProduct, productIdToCardNumber);

    const validation = validateDeck(
      dcRows.map((d) => ({ cardNumber: d.cardNumber, quantity: d.quantity })),
      deck.resourceDeckSize,
      meta,
      ownedByCardNumber,
    );

    const resolvedCards = await Promise.all(
      dcRows.map(async (d) => {
        const printings = printingsByCardNumber[d.cardNumber] ?? [d.cardNumber];
        const allocatedByPrinting = printings
          .filter((productId) => (allocMap[productId] ?? 0) > 0)
          .map((productId) => ({ productId, qty: allocMap[productId] ?? 0 }));
        const representativeProductId = printings[0] ?? d.cardNumber;
        const cardRow = await db
          .select()
          .from(cards)
          .where(eq(cards.productId, representativeProductId))
          .get();
        return {
          cardNumber: d.cardNumber,
          quantity: d.quantity,
          owned: ownedByCardNumber.get(d.cardNumber) ?? 0,
          allocated: sumAllocatedForCardNumber(d.cardNumber, printings, allocMap),
          allocatedByPrinting,
          card: cardRow ? serializeCard(cardRow) : null,
        };
      }),
    );
    resolvedCards.sort((a, b) => cardSortKey(a.card).localeCompare(cardSortKey(b.card)));

    return c.json({
      data: {
        ...deck,
        cards: resolvedCards,
        validation,
        complete: isDeckComplete(
          Object.fromEntries(dcRows.map((d) => [d.cardNumber, d.quantity])),
          allocMap,
          printingsByCardNumber,
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

  // PUT /api/decks/:id/cards — set quantity for a card_number (0 removes)
  .put('/:id/cards', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const id = Number(c.req.param('id'));
    const owned = await getOwnedDeck(db, userId, id);
    if (!owned) return c.json({ error: 'Deck not found' }, 404);

    const body = await readJson<{ cardNumber: string; productId?: string; quantity: number }>(c);
    const cardNumber = (body.cardNumber ?? body.productId ?? '').trim();
    if (!cardNumber) return c.json({ error: 'cardNumber required' }, 400);
    const quantity = clampInt(body.quantity ?? 0, 0, 99);
    const now = Math.floor(Date.now() / 1000);

    if (quantity <= 0) {
      await db
        .delete(deckCards)
        .where(and(eq(deckCards.deckId, id), eq(deckCards.cardNumber, cardNumber)));
      await db
        .update(decks)
        .set({ updatedAt: now })
        .where(and(eq(decks.id, id), eq(decks.userId, userId)));
      return c.json({ cardNumber, quantity: 0 });
    }
    const card = await db
      .select({ cardNumber: cards.cardNumber })
      .from(cards)
      .where(eq(cards.cardNumber, cardNumber))
      .orderBy(asc(cards.productId))
      .get();
    if (!card) return c.json({ error: 'Card not found' }, 404);
    await db
      .insert(deckCards)
      .values({ deckId: id, cardNumber, quantity })
      .onConflictDoUpdate({ target: [deckCards.deckId, deckCards.cardNumber], set: { quantity } });
    await db
      .update(decks)
      .set({ updatedAt: now })
      .where(and(eq(decks.id, id), eq(decks.userId, userId)));
    return c.json({ cardNumber, quantity });
  });

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(Number(n) || 0)));
}

function cardSortKey(card: ReturnType<typeof serializeCard> | null): string {
  if (!card) return 'zzz';
  return `${card.cardType ?? 'z'}-${String(card.cost ?? 99).padStart(2, '0')}-${card.name}`;
}
