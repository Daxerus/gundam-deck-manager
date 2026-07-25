import { Hono } from 'hono';
import { and, asc, eq } from 'drizzle-orm';
import type { AppEnv } from '../auth';
import { getDb } from '../db/client';
import { cards, collectionItems } from '../db/schema';
import { serializeCard } from './cards';
import { readJson } from '../util/json';

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

  // GET /api/collection/cards — owned cards with full data + quantity
  .get('/cards', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const rows = await db
      .select({ card: cards, quantity: collectionItems.quantity })
      .from(collectionItems)
      .innerJoin(cards, eq(cards.productId, collectionItems.productId))
      .where(eq(collectionItems.userId, userId))
      .orderBy(asc(cards.setCode), asc(cards.cardNumber))
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
