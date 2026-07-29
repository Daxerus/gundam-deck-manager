import { Hono } from 'hono';
import { asc, eq, sql, count } from 'drizzle-orm';
import type { AppEnv } from '../auth';
import { getDb } from '../db/client';
import { cards, meta } from '../db/schema';
import { listCards, serializeCard } from '../services/cardList';

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

  // GET /api/sets — distinct sets with counts
  .get('/sets', async (c) => {
    const db = getDb(c.env);
    // A set_code holds several set_name values, because promos and other-product
    // printings carry a generic label ("Promotion card", "Other Product Card") next to
    // the real set name. Pick the most common label so the filter shows e.g.
    // "GD05 · Freedom Ascension" rather than whichever name sorts last.
    const rows = await db
      .select({
        setCode: cards.setCode,
        // `cards.set_code` is spelled out rather than interpolated: Drizzle omits the
        // table qualifier inside a projection, and a bare "set_code" would bind to c2,
        // making the correlation a no-op.
        setName: sql<string | null>`(
          select c2.set_name
          from cards c2
          where c2.set_code = cards.set_code and c2.set_name is not null
          group by c2.set_name
          order by count(*) desc, c2.set_name asc
          limit 1
        )`,
        count: count(),
      })
      .from(cards)
      .groupBy(cards.setCode)
      .orderBy(asc(cards.setCode))
      .all();
    return c.json({ data: rows });
  })

  // GET /api/source-titles — distinct series (source_title) for filters
  .get('/source-titles', async (c) => {
    const db = getDb(c.env);
    const rows = await db
      .select({
        sourceTitle: cards.sourceTitle,
        count: count(),
      })
      .from(cards)
      .where(sql`${cards.sourceTitle} is not null and ${cards.sourceTitle} != ''`)
      .groupBy(cards.sourceTitle)
      .orderBy(asc(cards.sourceTitle))
      .all();
    return c.json({
      data: rows.map((r) => ({
        sourceTitle: r.sourceTitle as string,
        count: r.count,
      })),
    });
  })

  // GET /api/traits — distinct traits (from JSON array) for filters
  .get('/traits', async (c) => {
    const result = await c.env.DB.prepare(
      `SELECT json_each.value AS trait, COUNT(*) AS count
       FROM cards, json_each(cards.traits)
       WHERE cards.traits IS NOT NULL
         AND json_each.value IS NOT NULL
         AND json_each.value != ''
       GROUP BY json_each.value
       ORDER BY json_each.value`,
    ).all<{ trait: string; count: number }>();
    return c.json({ data: result.results ?? [] });
  })

  // GET /api/rarities — distinct rarities for filters
  .get('/rarities', async (c) => {
    const db = getDb(c.env);
    const rows = await db
      .select({
        rarity: cards.rarity,
        count: count(),
      })
      .from(cards)
      .where(sql`${cards.rarity} is not null and ${cards.rarity} != ''`)
      .groupBy(cards.rarity)
      .orderBy(asc(cards.rarity))
      .all();
    return c.json({
      data: rows.map((r) => ({
        rarity: r.rarity as string,
        count: r.count,
      })),
    });
  })

  // GET /api/status — catalog + dataset info
  .get('/status', async (c) => {
    const db = getDb(c.env);
    const total = (await db.select({ n: count() }).from(cards).get())?.n ?? 0;
    const version = (await db.select().from(meta).where(eq(meta.key, 'dataset_version')).get())?.value ?? null;
    const lastSync = (await db.select().from(meta).where(eq(meta.key, 'last_sync')).get())?.value ?? null;
    return c.json({ cardCount: total, datasetVersion: version, lastSync: lastSync ? Number(lastSync) : null });
  });
