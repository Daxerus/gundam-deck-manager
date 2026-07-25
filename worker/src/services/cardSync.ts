import { sql } from 'drizzle-orm';
import type { DB } from '../db/client';
import { cards, meta } from '../db/schema';
import type { Env } from '../env';

interface BulkCard {
  product_id: string;
  card_number: string;
  name: string;
  set_code: string;
  set_name?: string | null;
  rarity?: string | null;
  card_type?: string | null;
  color?: string | null;
  level?: number | null;
  cost?: number | null;
  ap?: number | null;
  hp?: number | null;
  ap_raw?: string | null;
  hp_raw?: string | null;
  zone?: string | null;
  trait?: string | null;
  link?: string | null;
  source_title?: string | null;
  block_icon?: string | null;
  sp?: string | null;
  effect?: string | null;
  image_url?: string | null;
  detail_url?: string | null;
  where_to_get?: string | null;
  keywords_text?: string | null;
  keyword_effects?: unknown;
  timing_markers?: unknown;
  traits?: unknown;
  link_refs?: unknown;
}

const UPSERT_CHUNK = 50;

export interface SyncResult {
  version: string | null;
  cardCount: number;
  upserted: number;
}

/** Downloads the full gcg-api dataset (unmetered bulk NDJSON) and upserts it into D1. */
export async function syncCards(db: DB, env: Env): Promise<SyncResult> {
  const base = env.GCG_API_BASE || 'https://api.gcgapi.com';

  const version = await fetchManifestVersion(base);
  const rows = await fetchBulkCards(base);

  let upserted = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const stmts = chunk.map((r) => upsertStmt(db, r));
    if (stmts.length > 0) {
      // drizzle d1 batch requires a non-empty tuple
      await db.batch(stmts as [(typeof stmts)[number], ...typeof stmts]);
      upserted += stmts.length;
    }
  }

  await db
    .insert(meta)
    .values({ key: 'dataset_version', value: version ?? 'unknown' })
    .onConflictDoUpdate({ target: meta.key, set: { value: version ?? 'unknown' } });
  await db
    .insert(meta)
    .values({ key: 'last_sync', value: String(Math.floor(Date.now() / 1000)) })
    .onConflictDoUpdate({ target: meta.key, set: { value: String(Math.floor(Date.now() / 1000)) } });

  return { version, cardCount: rows.length, upserted };
}

async function fetchManifestVersion(base: string): Promise<string | null> {
  try {
    const res = await fetch(`${base}/v1/manifest`, { headers: browserHeaders() });
    if (!res.ok) return null;
    const json = (await res.json()) as { dataset_version?: string };
    return json.dataset_version ?? null;
  } catch {
    return null;
  }
}

async function fetchBulkCards(base: string): Promise<BulkCard[]> {
  const res = await fetch(`${base}/v1/bulk`, { headers: browserHeaders() });
  if (!res.ok) {
    throw new Error(`Bulk download failed: HTTP ${res.status}`);
  }
  const text = await res.text();
  const out: BulkCard[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as BulkCard);
    } catch {
      // skip malformed line
    }
  }
  return out;
}

function upsertStmt(db: DB, r: BulkCard) {
  const values = {
    productId: r.product_id,
    cardNumber: r.card_number,
    name: r.name,
    setCode: r.set_code,
    setName: r.set_name ?? null,
    rarity: r.rarity ?? null,
    cardType: r.card_type ?? null,
    color: r.color ?? null,
    level: numOrNull(r.level),
    cost: numOrNull(r.cost),
    ap: numOrNull(r.ap),
    hp: numOrNull(r.hp),
    apRaw: r.ap_raw ?? null,
    hpRaw: r.hp_raw ?? null,
    zone: r.zone ?? null,
    trait: r.trait ?? null,
    link: r.link ?? null,
    sourceTitle: r.source_title ?? null,
    blockIcon: r.block_icon ?? null,
    sp: r.sp ?? null,
    effect: r.effect ?? null,
    imageUrl: r.image_url ?? null,
    detailUrl: r.detail_url ?? null,
    whereToGet: r.where_to_get ?? null,
    keywordsText: r.keywords_text ?? null,
    keywordEffects: jsonOrNull(r.keyword_effects),
    timingMarkers: jsonOrNull(r.timing_markers),
    traits: jsonOrNull(r.traits),
    linkRefs: jsonOrNull(r.link_refs),
  };
  const { productId, ...rest } = values;
  return db.insert(cards).values(values).onConflictDoUpdate({ target: cards.productId, set: rest });
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function jsonOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

function browserHeaders(): HeadersInit {
  return {
    'User-Agent': 'gundam-deck-manager/0.1 (+https://github.com)',
    Accept: 'application/json, application/x-ndjson, text/plain',
  };
}

/** Reads the stored dataset version, if any. */
export async function getStoredVersion(db: DB): Promise<string | null> {
  const row = await db.select().from(meta).where(sql`${meta.key} = 'dataset_version'`).get();
  return row?.value ?? null;
}
