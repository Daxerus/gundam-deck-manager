import { and, asc, eq, inArray, like, ne, or, sql, count, isNull, type SQL } from 'drizzle-orm';
import type { DB } from '../db/client';
import { cards, type CardRow } from '../db/schema';
import type { StatusColor } from './cardStatus';

/**
 * Subquery of product_ids visible in a user's collection (owned or lent out).
 * Uses set-based SELECTs so D1 reads scale with the user's collection, not the catalog.
 */
function visibleProductIdSubquery(userId: number): SQL {
  return sql`(
    select product_id from collection_items
    where user_id = ${userId} and quantity > 0
    union
    select li.product_id from loan_items li
    inner join loans l on l.id = li.loan_id
    where l.status = 'open' and l.lender_id = ${userId}
  )`;
}

/**
 * Subquery of product_ids matching ownership + optional status colour.
 * Aggregates owned/alloc/lent/borrowed once via JOINs (not per catalog row).
 * Mirrors the rules previously in collectionCondition / services/cardStatus.ts.
 */
function matchingProductIdSubquery(userId: number, statusColor: StatusColor | null): SQL {
  if (!statusColor) return visibleProductIdSubquery(userId);

  const statusPred =
    statusColor === 'green'
      ? sql`(coalesce(o.qty, 0) + coalesce(l.qty, 0)) > 0
          and coalesce(l.qty, 0) = 0 and coalesce(b.qty, 0) = 0
          and coalesce(a.qty, 0) = 0`
      : statusColor === 'red'
        ? sql`(coalesce(o.qty, 0) + coalesce(l.qty, 0)) > 0
            and coalesce(l.qty, 0) = 0 and coalesce(b.qty, 0) = 0
            and coalesce(o.qty, 0) > 0 and coalesce(a.qty, 0) >= coalesce(o.qty, 0)`
        : sql`(coalesce(o.qty, 0) + coalesce(l.qty, 0)) > 0
            and (
              coalesce(l.qty, 0) > 0 or coalesce(b.qty, 0) > 0
              or (coalesce(a.qty, 0) > 0 and coalesce(a.qty, 0) < coalesce(o.qty, 0))
            )`;

  return sql`(
    select k.product_id
    from (
      select product_id from collection_items
      where user_id = ${userId} and quantity > 0
      union
      select li.product_id from loan_items li
      inner join loans l on l.id = li.loan_id
      where l.status = 'open' and (l.lender_id = ${userId} or l.borrower_id = ${userId})
    ) k
    left join (
      select product_id, quantity as qty from collection_items where user_id = ${userId}
    ) o on o.product_id = k.product_id
    left join (
      select a.product_id, sum(a.quantity) as qty
      from allocations a
      inner join decks d on d.id = a.deck_id
      where d.user_id = ${userId} and d.is_active = 1
      group by a.product_id
    ) a on a.product_id = k.product_id
    left join (
      select li.product_id, sum(li.quantity) as qty
      from loan_items li
      inner join loans l on l.id = li.loan_id
      where l.status = 'open' and l.lender_id = ${userId}
      group by li.product_id
    ) l on l.product_id = k.product_id
    left join (
      select li.product_id, sum(li.quantity) as qty
      from loan_items li
      inner join loans l on l.id = li.loan_id
      where l.status = 'open' and l.borrower_id = ${userId}
      group by li.product_id
    ) b on b.product_id = k.product_id
    where ${statusPred}
  )`;
}

/**
 * Ownership / status-colour filter as a set membership predicate.
 * Prefer this over correlated per-row subqueries against the full catalog.
 */
export function collectionOwnershipFilter(
  userId: number,
  statusColor: StatusColor | null,
  opts: { groupVariants: boolean },
): SQL {
  const matched = matchingProductIdSubquery(userId, statusColor);
  if (opts.groupVariants) {
    // Include the card identity if ANY of its printings matches.
    return sql`${cards.cardNumber} in (
      select c.card_number from cards c
      where c.product_id in ${matched}
    )`;
  }
  return sql`${cards.productId} in ${matched}`;
}

/**
 * Set filter for one printing. `set_code` comes straight from the source dataset and
 * often disagrees with the card number prefix (promos and Deck Build Box reprints keep
 * their original number, e.g. GD01-086_p3 sits in SC01), so a card also matches the set
 * its number was printed under. Prefix is extracted instead of using LIKE so that `_`
 * in a caller-supplied code cannot act as a wildcard.
 */
function setCondition(setCode: string): SQL {
  const set = setCode.toLowerCase();
  const numberPrefix = sql`lower(substr(${cards.cardNumber}, 1, instr(${cards.cardNumber}, '-') - 1))`;
  return or(eq(sql`lower(${cards.setCode})`, set), eq(numberPrefix, set))!;
}

/**
 * Catalog display order: driven by `card_number`, never by `set_code`. A reprint keeps
 * its original number but carries the reprinting product's set code (GD01-065 shipped
 * again inside a later Deck Build Box), so ordering by set first tears holes in a set's
 * numbering. The numeric part is cast to an integer so unpadded numbers stay in place.
 */
export function cardNumberOrderBy(): SQL[] {
  const dash = sql`instr(${cards.cardNumber}, '-')`;
  const prefix = sql`case when ${dash} > 0
    then lower(substr(${cards.cardNumber}, 1, ${dash} - 1))
    else lower(${cards.cardNumber}) end`;
  const numeric = sql`case when ${dash} > 0
    then cast(substr(${cards.cardNumber}, ${dash} + 1) as integer)
    else 0 end`;
  // Trailing cardNumber tie-break keeps suffixed numbers (e.g. GD01-001a) deterministic.
  return [asc(prefix), asc(numeric), asc(cards.cardNumber), asc(cards.productId)];
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function parseJson(v: string | null): unknown {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
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

export type CardListQuery = Record<string, string | undefined>;

export interface CardListResult {
  _meta: { total: number; limit: number; offset: number; count: number; hasMore: boolean };
  data: (ReturnType<typeof serializeCard> & { variants?: ReturnType<typeof serializeCard>[] })[];
}

/**
 * Paginated card catalog listing with optional collection-scoped filters.
 * When `ownedOnly` or `statusColor` is set, `collectionUserId` scopes the
 * visibility predicates (own collection or a friend's).
 */
export async function listCards(
  db: DB,
  q: CardListQuery,
  opts: { collectionUserId?: number | null; forceOwnedOnly?: boolean } = {},
): Promise<CardListResult> {
  const groupVariants = q.group_variants === '1' || q.group_variants === 'true';
  const statusColor =
    q.status_color === 'green' || q.status_color === 'yellow' || q.status_color === 'red'
      ? q.status_color
      : null;
  const ownedOnly =
    opts.forceOwnedOnly || q.owned_only === '1' || q.owned_only === 'true' || !!statusColor;

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
  if (q.set_code) conds.push(setCondition(q.set_code));
  if (q.card_type) conds.push(eq(sql`lower(${cards.cardType})`, q.card_type.toLowerCase()));
  if (q.exclude_card_type) {
    const excluded = q.exclude_card_type.toLowerCase();
    conds.push(or(isNull(cards.cardType), ne(sql`lower(${cards.cardType})`, excluded))!);
  }
  if (q.color) {
    // OR semantics: card matches if its color is ANY of the selected colors.
    const selected = q.color
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    if (selected.length === 1) {
      conds.push(eq(cards.color, selected[0]!));
    } else if (selected.length > 1) {
      conds.push(inArray(cards.color, selected));
    }
  }
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
  if (q.source_title) {
    conds.push(eq(cards.sourceTitle, q.source_title));
  }
  if (q.traits) {
    // OR semantics: card matches if it has ANY of the selected traits.
    const selected = q.traits
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (selected.length > 0) {
      conds.push(
        or(
          ...selected.map(
            (t) =>
              sql`exists (
                select 1 from json_each(${cards.traits})
                where lower(value) = ${t.toLowerCase()}
              )`,
          ),
        )!,
      );
    }
  }
  if (q.link_ref) {
    // OR semantics: unit matches if link_refs contains ANY of the given refs
    // (pilot name and/or pilot traits).
    const selected = q.link_ref
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (selected.length > 0) {
      conds.push(
        or(
          ...selected.map(
            (t) =>
              sql`exists (
                select 1 from json_each(${cards.linkRefs})
                where lower(value) = ${t.toLowerCase()}
              )`,
          ),
        )!,
      );
    }
  }
  if (ownedOnly) {
    const userId = opts.collectionUserId;
    if (userId == null) {
      throw new Error('collectionUserId required when filtering by ownership');
    }
    conds.push(collectionOwnershipFilter(userId, statusColor, { groupVariants }));
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

  // Fetch one extra row so hasMore does not require a COUNT on every page.
  const fetched = await db
    .select()
    .from(cards)
    .where(where)
    .orderBy(...cardNumberOrderBy())
    .limit(limit + 1)
    .offset(offset)
    .all();

  const hasMore = fetched.length > limit;
  const rows = hasMore ? fetched.slice(0, limit) : fetched;

  let total: number;
  if (offset === 0) {
    const totalRow = await db.select({ n: count() }).from(cards).where(where).get();
    total = totalRow?.n ?? 0;
  } else {
    // UI reads total from page 0; later pages only need hasMore for pagination.
    total = offset + rows.length + (hasMore ? 1 : 0);
  }

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

  return {
    _meta: { total, limit, offset, count: rows.length, hasMore },
    data: rows.map((row) => ({
      ...serializeCard(row),
      ...(groupVariants
        ? { variants: (variantsByNumber.get(row.cardNumber) ?? [row]).map(serializeCard) }
        : {}),
    })),
  };
}
