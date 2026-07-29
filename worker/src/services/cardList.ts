import { and, asc, eq, inArray, like, ne, or, sql, count, isNull, type SQL } from 'drizzle-orm';
import type { DB } from '../db/client';
import { cards, type CardRow } from '../db/schema';
import type { StatusColor } from './cardStatus';

/**
 * Collection visibility / status-colour predicate for one printing, expressed as
 * correlated subqueries. Materialising the product_id list instead would blow past
 * D1's 100 bound-parameter cap for any real-sized collection.
 * Mirrors the rules in services/cardStatus.ts.
 */
export function collectionCondition(
  userId: number,
  statusColor: StatusColor | null,
  productId: SQL,
): SQL {
  const owned = sql`coalesce((
    select ci.quantity from collection_items ci
    where ci.user_id = ${userId} and ci.product_id = ${productId}
  ), 0)`;
  const alloc = sql`coalesce((
    select sum(a.quantity) from allocations a
    inner join decks d on d.id = a.deck_id
    where d.user_id = ${userId} and d.is_active = 1 and a.product_id = ${productId}
  ), 0)`;
  const lent = sql`coalesce((
    select sum(li.quantity) from loan_items li
    inner join loans l on l.id = li.loan_id
    where l.status = 'open' and l.lender_id = ${userId} and li.product_id = ${productId}
  ), 0)`;
  const borrowed = sql`coalesce((
    select sum(li.quantity) from loan_items li
    inner join loans l on l.id = li.loan_id
    where l.status = 'open' and l.borrower_id = ${userId} and li.product_id = ${productId}
  ), 0)`;

  const visible = sql`(${owned} + ${lent}) > 0`;
  if (!statusColor) return visible;

  const hasLoans = sql`(${lent} > 0 or ${borrowed} > 0)`;
  if (statusColor === 'green') {
    return sql`${visible} and not ${hasLoans} and ${alloc} = 0`;
  }
  if (statusColor === 'red') {
    return sql`${visible} and not ${hasLoans} and ${owned} > 0 and ${alloc} >= ${owned}`;
  }
  return sql`${visible} and (${hasLoans} or (${alloc} > 0 and ${alloc} < ${owned}))`;
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
  _meta: { total: number; limit: number; offset: number; count: number };
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
    if (groupVariants) {
      // Include the card identity if ANY of its printings matches.
      conds.push(
        sql`exists (
          select 1
          from cards owned_card
          where owned_card.card_number = ${cards.cardNumber}
            and ${collectionCondition(userId, statusColor, sql`owned_card.product_id`)}
        )`,
      );
    } else {
      conds.push(collectionCondition(userId, statusColor, sql`${cards.productId}`));
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

  return {
    _meta: { total, limit, offset, count: rows.length },
    data: rows.map((row) => ({
      ...serializeCard(row),
      ...(groupVariants
        ? { variants: (variantsByNumber.get(row.cardNumber) ?? [row]).map(serializeCard) }
        : {}),
    })),
  };
}
