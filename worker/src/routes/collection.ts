import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
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
