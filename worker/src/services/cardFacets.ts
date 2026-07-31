import { asc, eq, sql, count } from 'drizzle-orm';
import type { DB } from '../db/client';
import { cards, meta } from '../db/schema';

export const FACET_SETS_KEY = 'facet_sets';
export const FACET_TRAITS_KEY = 'facet_traits';
export const FACET_RARITIES_KEY = 'facet_rarities';
export const FACET_SOURCE_TITLES_KEY = 'facet_source_titles';

export type SetFacet = { setCode: string; setName: string | null; count: number };
export type TraitFacet = { trait: string; count: number };
export type RarityFacet = { rarity: string; count: number };
export type SourceTitleFacet = { sourceTitle: string; count: number };

/** Minimal card shape needed to build facets (bulk sync rows or DB rows). */
export type FacetCardInput = {
  set_code: string;
  set_name?: string | null;
  rarity?: string | null;
  source_title?: string | null;
  traits?: unknown;
};

async function upsertMeta(db: DB, key: string, value: string): Promise<void> {
  await db
    .insert(meta)
    .values({ key, value })
    .onConflictDoUpdate({ target: meta.key, set: { value } });
}

async function readMetaJson<T>(db: DB, key: string): Promise<T | null> {
  const row = await db.select().from(meta).where(eq(meta.key, key)).get();
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

/** Build filter facets from an in-memory card list (used during sync — no extra D1 reads). */
export function buildFacetsFromCards(rows: FacetCardInput[]): {
  sets: SetFacet[];
  traits: TraitFacet[];
  rarities: RarityFacet[];
  sourceTitles: SourceTitleFacet[];
} {
  const setCounts = new Map<string, number>();
  const setNameVotes = new Map<string, Map<string, number>>();
  const traitCounts = new Map<string, number>();
  const rarityCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();

  for (const r of rows) {
    const setCode = r.set_code;
    if (setCode) {
      setCounts.set(setCode, (setCounts.get(setCode) ?? 0) + 1);
      const name = r.set_name?.trim();
      if (name) {
        let votes = setNameVotes.get(setCode);
        if (!votes) {
          votes = new Map();
          setNameVotes.set(setCode, votes);
        }
        votes.set(name, (votes.get(name) ?? 0) + 1);
      }
    }

    if (r.rarity) {
      rarityCounts.set(r.rarity, (rarityCounts.get(r.rarity) ?? 0) + 1);
    }

    const source = r.source_title?.trim();
    if (source) {
      sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
    }

    const traits = normalizeTraits(r.traits);
    for (const t of traits) {
      traitCounts.set(t, (traitCounts.get(t) ?? 0) + 1);
    }
  }

  const sets: SetFacet[] = [...setCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([setCode, n]) => ({
      setCode,
      setName: pickMostCommonName(setNameVotes.get(setCode)),
      count: n,
    }));

  const traits: TraitFacet[] = [...traitCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([trait, n]) => ({ trait, count: n }));

  const rarities: RarityFacet[] = [...rarityCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([rarity, n]) => ({ rarity, count: n }));

  const sourceTitles: SourceTitleFacet[] = [...sourceCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sourceTitle, n]) => ({ sourceTitle, count: n }));

  return { sets, traits, rarities, sourceTitles };
}

function normalizeTraits(raw: unknown): string[] {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const out: string[] = [];
  for (const v of parsed) {
    if (typeof v === 'string' && v.trim()) out.push(v);
  }
  return out;
}

function pickMostCommonName(votes: Map<string, number> | undefined): string | null {
  if (!votes || votes.size === 0) return null;
  let best: string | null = null;
  let bestCount = -1;
  for (const [name, n] of votes) {
    if (n > bestCount || (n === bestCount && best != null && name < best)) {
      best = name;
      bestCount = n;
    }
  }
  return best;
}

/** Persist facets to meta (called after catalog sync). */
export async function storeFacets(
  db: DB,
  facets: ReturnType<typeof buildFacetsFromCards>,
): Promise<void> {
  await upsertMeta(db, FACET_SETS_KEY, JSON.stringify(facets.sets));
  await upsertMeta(db, FACET_TRAITS_KEY, JSON.stringify(facets.traits));
  await upsertMeta(db, FACET_RARITIES_KEY, JSON.stringify(facets.rarities));
  await upsertMeta(db, FACET_SOURCE_TITLES_KEY, JSON.stringify(facets.sourceTitles));
}

export async function getSetsFacet(db: DB): Promise<SetFacet[]> {
  const cached = await readMetaJson<SetFacet[]>(db, FACET_SETS_KEY);
  if (cached) return cached;
  const live = await computeSetsLive(db);
  await upsertMeta(db, FACET_SETS_KEY, JSON.stringify(live));
  return live;
}

export async function getTraitsFacet(db: DB, d1: D1Database): Promise<TraitFacet[]> {
  const cached = await readMetaJson<TraitFacet[]>(db, FACET_TRAITS_KEY);
  if (cached) return cached;
  const live = await computeTraitsLive(d1);
  await upsertMeta(db, FACET_TRAITS_KEY, JSON.stringify(live));
  return live;
}

export async function getRaritiesFacet(db: DB): Promise<RarityFacet[]> {
  const cached = await readMetaJson<RarityFacet[]>(db, FACET_RARITIES_KEY);
  if (cached) return cached;
  const live = await computeRaritiesLive(db);
  await upsertMeta(db, FACET_RARITIES_KEY, JSON.stringify(live));
  return live;
}

export async function getSourceTitlesFacet(db: DB): Promise<SourceTitleFacet[]> {
  const cached = await readMetaJson<SourceTitleFacet[]>(db, FACET_SOURCE_TITLES_KEY);
  if (cached) return cached;
  const live = await computeSourceTitlesLive(db);
  await upsertMeta(db, FACET_SOURCE_TITLES_KEY, JSON.stringify(live));
  return live;
}

async function computeSetsLive(db: DB): Promise<SetFacet[]> {
  const rows = await db
    .select({
      setCode: cards.setCode,
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
  return rows;
}

async function computeTraitsLive(d1: D1Database): Promise<TraitFacet[]> {
  const result = await d1
    .prepare(
      `SELECT json_each.value AS trait, COUNT(*) AS count
       FROM cards, json_each(cards.traits)
       WHERE cards.traits IS NOT NULL
         AND json_each.value IS NOT NULL
         AND json_each.value != ''
       GROUP BY json_each.value
       ORDER BY json_each.value`,
    )
    .all<{ trait: string; count: number }>();
  return result.results ?? [];
}

async function computeRaritiesLive(db: DB): Promise<RarityFacet[]> {
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
  return rows.map((r) => ({ rarity: r.rarity as string, count: r.count }));
}

async function computeSourceTitlesLive(db: DB): Promise<SourceTitleFacet[]> {
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
  return rows.map((r) => ({ sourceTitle: r.sourceTitle as string, count: r.count }));
}
