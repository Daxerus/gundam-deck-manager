import { Hono } from 'hono';
import { and, asc, eq, gt, inArray, like, ne, or, sql, count, isNull } from 'drizzle-orm';
import type { AppEnv } from '../auth';
import { getDb } from '../db/client';
import { cards, collectionItems, meta, type CardRow } from '../db/schema';

export const cardsRoutes = new Hono<AppEnv>()
  // GET /api/cards — list/filter with pagination
  .get('/cards', async (c) => {
    const db = getDb(c.env);
    const q = c.req.query();
    const groupVariants = q.group_variants === '1' || q.group_variants === 'true';

    const conds = [];
    if (groupVariants) {
      // One catalog tile per playable card identity. The selected row is the
      // base product_id when present, otherwise the first available printing.
      conds.push(
        sql`${cards.productId} = (
          select min(c2.product_id)
          from cards c2
          where c2.card_number = ${cards.cardNumber}
        )`,
      );
    }
    if (q.set_code) conds.push(eq(sql`lower(${cards.setCode})`, q.set_code.toLowerCase()));
    if (q.card_type) conds.push(eq(sql`lower(${cards.cardType})`, q.card_type.toLowerCase()));
    if (q.exclude_card_type) {
      const excluded = q.exclude_card_type.toLowerCase();
      conds.push(or(isNull(cards.cardType), ne(sql`lower(${cards.cardType})`, excluded))!);
    }
    if (q.color) conds.push(eq(cards.color, q.color));
    if (q.rarity) conds.push(eq(cards.rarity, q.rarity));
    if (q.name) {
      const search = `%${q.name.trim().toLowerCase()}%`;
      conds.push(
        or(
          like(sql`lower(${cards.name})`, search),
          like(sql`lower(${cards.cardNumber})`, search),
        )!,
      );
    }
    if (q.effect) conds.push(like(sql`lower(${cards.effect})`, `%${q.effect.toLowerCase()}%`));
    if (q.owned_only === '1' || q.owned_only === 'true') {
      const userId = c.get('userId')!;
      if (groupVariants) {
        // Include the card identity if ANY printing is owned.
        conds.push(
          sql`exists (
            select 1
            from collection_items ci
            inner join cards owned_card on owned_card.product_id = ci.product_id
            where ci.user_id = ${userId}
              and ci.quantity > 0
              and owned_card.card_number = ${cards.cardNumber}
          )`,
        );
      } else {
        conds.push(
          inArray(
            cards.productId,
            db
              .select({ id: collectionItems.productId })
              .from(collectionItems)
              .where(and(eq(collectionItems.userId, userId), gt(collectionItems.quantity, 0))),
          ),
        );
      }
    }
    for (const [key, col] of [
      ['level', cards.level],
      ['cost', cards.cost],
      ['ap', cards.ap],
      ['hp', cards.hp],
    ] as const) {
      const raw = q[key];
      if (raw !== undefined && raw !== '' && Number.isFinite(Number(raw))) {
        conds.push(eq(col, Number(raw)));
      }
    }

    const where = conds.length ? and(...conds) : undefined;
    const limit = clamp(Number(q.limit) || 60, 1, 250);
    const offset = Math.max(0, Number(q.offset) || 0);

    const totalRow = await db.select({ n: count() }).from(cards).where(where).get();
    const total = totalRow?.n ?? 0;

    const rows = await db
      .select()
      .from(cards)
      .where(where)
      .orderBy(asc(cards.setCode), asc(cards.cardNumber), asc(cards.productId))
      .limit(limit)
      .offset(offset)
      .all();

    const variantsByNumber = new Map<string, CardRow[]>();
    if (groupVariants && rows.length > 0) {
      const cardNumbers = [...new Set(rows.map((row) => row.cardNumber))];
      const variantRows = await db
        .select()
        .from(cards)
        .where(inArray(cards.cardNumber, cardNumbers))
        .orderBy(asc(cards.cardNumber), asc(cards.productId))
        .all();
      for (const row of variantRows) {
        const variants = variantsByNumber.get(row.cardNumber) ?? [];
        variants.push(row);
        variantsByNumber.set(row.cardNumber, variants);
      }
    }

    return c.json({
      _meta: { total, limit, offset, count: rows.length },
      data: rows.map((row) => ({
        ...serializeCard(row),
        ...(groupVariants
          ? { variants: (variantsByNumber.get(row.cardNumber) ?? [row]).map(serializeCard) }
          : {}),
      })),
    });
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
    const rows = await db
      .select({
        setCode: cards.setCode,
        setName: sql<string>`max(${cards.setName})`,
        count: count(),
      })
      .from(cards)
      .groupBy(cards.setCode)
      .orderBy(asc(cards.setCode))
      .all();
    return c.json({ data: rows });
  })

  // GET /api/status — catalog + dataset info
  .get('/status', async (c) => {
    const db = getDb(c.env);
    const total = (await db.select({ n: count() }).from(cards).get())?.n ?? 0;
    const version = (await db.select().from(meta).where(eq(meta.key, 'dataset_version')).get())?.value ?? null;
    const lastSync = (await db.select().from(meta).where(eq(meta.key, 'last_sync')).get())?.value ?? null;
    return c.json({ cardCount: total, datasetVersion: version, lastSync: lastSync ? Number(lastSync) : null });
  });

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function serializeCard(row: CardRow) {
  return {
    productId: row.productId,
    cardNumber: row.cardNumber,
    name: row.name,
    setCode: row.setCode,
    setName: row.setName,
    rarity: row.rarity,
    cardType: row.cardType,
    color: row.color,
    level: row.level,
    cost: row.cost,
    ap: row.ap,
    hp: row.hp,
    apRaw: row.apRaw,
    hpRaw: row.hpRaw,
    zone: row.zone,
    trait: row.trait,
    link: row.link,
    sourceTitle: row.sourceTitle,
    blockIcon: row.blockIcon,
    sp: row.sp,
    effect: row.effect,
    imageUrl: row.imageUrl,
    detailUrl: row.detailUrl,
    whereToGet: row.whereToGet,
    keywordsText: row.keywordsText,
    keywordEffects: parseJson(row.keywordEffects),
    timingMarkers: parseJson(row.timingMarkers),
    traits: parseJson(row.traits),
    linkRefs: parseJson(row.linkRefs),
  };
}

function parseJson(v: string | null): unknown {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}
