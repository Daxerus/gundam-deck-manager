import { Hono } from 'hono';
import { and, eq, inArray } from 'drizzle-orm';
import type { AppEnv } from '../auth';
import { getDb } from '../db/client';
import { cards, collectionItems } from '../db/schema';
import { serializeCard } from './cards';
import { cardNumberOrderBy } from '../services/cardList';
import { readJson } from '../util/json';
import { getCollectionStatus } from '../services/loans';

export const collectionRoutes = new Hono<AppEnv>()
  // GET /api/collection — owned quantities keyed by product_id
  .get('/', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const rows = await db
      .select()
      .from(collectionItems)
      .where(eq(collectionItems.userId, userId))
      .all();
    const map: Record<string, number> = {};
    for (const r of rows) map[r.productId] = r.quantity;
    return c.json({ data: map });
  })

  // GET /api/collection/owned-by-card — owned quantities summed across printings, keyed by card_number
  .get('/owned-by-card', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const rows = await db
      .select({
        productId: collectionItems.productId,
        cardNumber: cards.cardNumber,
        quantity: collectionItems.quantity,
      })
      .from(collectionItems)
      .leftJoin(cards, eq(cards.productId, collectionItems.productId))
      .where(eq(collectionItems.userId, userId))
      .all();
    const map: Record<string, number> = {};
    for (const r of rows) {
      // Printings missing from the catalog fall back to their product_id, as deck detail does.
      const key = r.cardNumber ?? r.productId;
      map[key] = (map[key] ?? 0) + (Number(r.quantity) || 0);
    }
    return c.json({ data: map });
  })

  // GET /api/collection/status — location + loan breakdown per printing
  .get('/status', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const data = await getCollectionStatus(db, userId);
    return c.json({ data });
  })

  // GET /api/collection/cards — owned cards with full data + quantity
  .get('/cards', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const rows = await db
      .select({ card: cards, quantity: collectionItems.quantity })
      .from(collectionItems)
      .innerJoin(cards, eq(cards.productId, collectionItems.productId))
      .where(eq(collectionItems.userId, userId))
      .orderBy(...cardNumberOrderBy())
      .all();
    return c.json({ data: rows.map((r) => ({ ...serializeCard(r.card), quantity: r.quantity })) });
  })

  // PUT /api/collection/bulk — apply a batch of owned quantities (0 removes)
  .put('/bulk', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const body = await readJson<{ items: { productId: string; quantity: number }[] }>(c);
    if (!Array.isArray(body.items)) return c.json({ error: 'items array required' }, 400);
    if (body.items.length > MAX_BULK_ITEMS) {
      return c.json({ error: `Too many items (max ${MAX_BULK_ITEMS})` }, 400);
    }

    // Quantities are absolute, not deltas, so a repeated product keeps its last value.
    const qtyByProduct = new Map<string, number>();
    for (const item of body.items) {
      const productId = (item.productId ?? '').trim();
      if (!productId) continue;
      qtyByProduct.set(productId, clampInt(item.quantity ?? 0, 0, MAX_QUANTITY));
    }
    if (qtyByProduct.size === 0) return c.json({ ok: true, items: [] });

    const entries = [...qtyByProduct.entries()];
    const removals = entries.filter(([, quantity]) => quantity <= 0).map(([productId]) => productId);
    const upserts = entries.filter(([, quantity]) => quantity > 0);

    const stmts = [
      ...chunk(removals, BATCH_CHUNK).map((productIds) =>
        db
          .delete(collectionItems)
          .where(
            and(eq(collectionItems.userId, userId), inArray(collectionItems.productId, productIds)),
          ),
      ),
      ...upserts.map(([productId, quantity]) =>
        db
          .insert(collectionItems)
          .values({ userId, productId, quantity })
          .onConflictDoUpdate({
            target: [collectionItems.userId, collectionItems.productId],
            set: { quantity },
          }),
      ),
    ];
    for (const group of chunk(stmts, BATCH_CHUNK)) {
      await db.batch(group as [(typeof stmts)[number], ...typeof stmts]);
    }

    return c.json({
      ok: true,
      items: entries.map(([productId, quantity]) => ({ productId, quantity })),
    });
  })

  // PUT /api/collection/:productId — set owned quantity (0 removes it)
  .put('/:productId', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const productId = c.req.param('productId');
    const body = await readJson<{ quantity: number }>(c);
    const quantity = Math.max(0, Math.floor(Number(body.quantity) || 0));

    if (quantity <= 0) {
      await db
        .delete(collectionItems)
        .where(and(eq(collectionItems.userId, userId), eq(collectionItems.productId, productId)));
      return c.json({ productId, quantity: 0 });
    }
    await db
      .insert(collectionItems)
      .values({ userId, productId, quantity })
      .onConflictDoUpdate({
        target: [collectionItems.userId, collectionItems.productId],
        set: { quantity },
      });
    return c.json({ productId, quantity });
  });

const MAX_BULK_ITEMS = 500;
const MAX_QUANTITY = 9999;
/** Keep each D1 batch (and each IN (...) list) well below the bound-parameter limit. */
const BATCH_CHUNK = 50;

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(Number(n) || 0)));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
