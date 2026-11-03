import { Hono } from 'hono';
import { asc, eq, count, inArray, sql } from 'drizzle-orm';
import type { AppEnv } from '../auth';
import { getDb } from '../db/client';
import { cards, meta } from '../db/schema';
import { listCards, serializeCard } from '../services/cardList';
import { readJson } from '../util/json';
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

  // POST /api/cards/resolve — map pasted codes to a printing (exact product, else base)
  .post('/cards/resolve', async (c) => {
    const body = await readJson<{ codes: string[] }>(c);
    if (!Array.isArray(body.codes)) return c.json({ error: 'codes array required' }, 400);

    const codes: string[] = [];
    const seen = new Set<string>();
    for (const raw of body.codes) {
      const code = String(raw ?? '').trim().toUpperCase();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      codes.push(code);
    }
    if (codes.length > MAX_RESOLVE_CODES) {
      return c.json({ error: `Too many codes (max ${MAX_RESOLVE_CODES})` }, 400);
    }
    if (codes.length === 0) return c.json({ data: [], missing: [] });

    const db = getDb(c.env);
    type Hit = { productId: string; cardNumber: string; name: string };
    const byProduct = new Map<string, Hit>();
    const byNumber = new Map<string, Hit>();

    for (const part of chunk(codes, RESOLVE_CHUNK)) {
      const [byNumberRows, byProductRows] = await Promise.all([
        db
          .select({ productId: cards.productId, cardNumber: cards.cardNumber, name: cards.name })
          .from(cards)
          .where(inArray(sql`upper(${cards.cardNumber})`, part))
          .all(),
        db
          .select({ productId: cards.productId, cardNumber: cards.cardNumber, name: cards.name })
          .from(cards)
          .where(inArray(sql`upper(${cards.productId})`, part))
          .all(),
      ]);
      for (const row of [...byNumberRows, ...byProductRows]) {
        const hit: Hit = { productId: row.productId, cardNumber: row.cardNumber, name: row.name };
        byProduct.set(row.productId.toUpperCase(), hit);
        const numberKey = row.cardNumber.toUpperCase();
        const prev = byNumber.get(numberKey);
        if (!prev || row.productId.localeCompare(prev.productId) < 0) byNumber.set(numberKey, hit);
      }
    }

    const data: { code: string; productId: string; cardNumber: string; name: string }[] = [];
    const missing: string[] = [];
    for (const code of codes) {
      const hit = byProduct.get(code) ?? byNumber.get(code);
      if (!hit) {
        missing.push(code);
        continue;
      }
      data.push({ code, ...hit });
    }
    return c.json({ data, missing });
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

const MAX_RESOLVE_CODES = 2000;
/** Stay under D1's bound-parameter limit for each IN (...). */
const RESOLVE_CHUNK = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
