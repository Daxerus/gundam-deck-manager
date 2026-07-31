import { Hono } from 'hono';
import { asc, eq, count } from 'drizzle-orm';
import type { AppEnv } from '../auth';
import { getDb } from '../db/client';
import { cards, meta } from '../db/schema';
import { listCards, serializeCard } from '../services/cardList';
import {
  getRaritiesFacet,
  getSetsFacet,
  getSourceTitlesFacet,
  getTraitsFacet,
} from '../services/cardFacets';

export { serializeCard };

export const cardsRoutes = new Hono<AppEnv>()
  // GET /api/cards — list/filter with pagination
  .get('/cards', async (c) => {
    const db = getDb(c.env);
    const q = c.req.query();
    const result = await listCards(db, q, {
      collectionUserId: c.get('userId'),
    });
    return c.json(result);
  })

  // GET /api/cards/:id — by product_id or card_number (base printing)
  .get('/cards/:id', async (c) => {
    const db = getDb(c.env);
    const id = c.req.param('id');
    let row = await db.select().from(cards).where(eq(cards.productId, id)).get();
    if (!row) {
      row = await db
        .select()
        .from(cards)
        .where(eq(cards.cardNumber, id))
        .orderBy(asc(cards.productId))
        .get();
    }
    if (!row) return c.json({ error: 'Card not found' }, 404);
    return c.json({ data: serializeCard(row) });
  })

  // GET /api/sets — distinct sets with counts (from meta facets when available)
  .get('/sets', async (c) => {
    const db = getDb(c.env);
    const data = await getSetsFacet(db);
    return c.json({ data });
  })

  // GET /api/source-titles — distinct series for filters
  .get('/source-titles', async (c) => {
    const db = getDb(c.env);
    const data = await getSourceTitlesFacet(db);
    return c.json({ data });
  })

  // GET /api/traits — distinct traits for filters
  .get('/traits', async (c) => {
    const db = getDb(c.env);
    const data = await getTraitsFacet(db, c.env.DB);
    return c.json({ data });
  })

  // GET /api/rarities — distinct rarities for filters
  .get('/rarities', async (c) => {
    const db = getDb(c.env);
    const data = await getRaritiesFacet(db);
    return c.json({ data });
  })

  // GET /api/status — catalog + dataset info
  .get('/status', async (c) => {
    const db = getDb(c.env);
    const total = (await db.select({ n: count() }).from(cards).get())?.n ?? 0;
    const version = (await db.select().from(meta).where(eq(meta.key, 'dataset_version')).get())?.value ?? null;
    const lastSync = (await db.select().from(meta).where(eq(meta.key, 'last_sync')).get())?.value ?? null;
    return c.json({ cardCount: total, datasetVersion: version, lastSync: lastSync ? Number(lastSync) : null });
  });
