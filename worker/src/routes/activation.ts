import { Hono } from 'hono';
import type { AppEnv } from '../auth';
import { getDb } from '../db/client';
import {
  computeActivationPlan,
  sumOwnedForCardNumber,
  type ActivationOptions,
  type ActivationPlan,
  type PullPreference,
} from '../services/allocation';
import {
  applyActivationPlan,
  deactivateDeck,
  getCardLocations,
  getCardMetaForCardNumbers,
  getCardMetaForProductIds,
  getOwnedByProductId,
  getPrintingsByCardNumber,
  listCardLocations,
  loadDeckStates,
  setCardLocation,
} from '../services/deckState';
import { getOwnedDeck } from '../services/scope';
import { readJson } from '../util/json';

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function parseAllowBox(value: unknown): boolean {
  return value !== false;
}

function normalizePreferences(raw: unknown): PullPreference[] {
  if (!Array.isArray(raw)) return [];
  const out: PullPreference[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const cardNumber = String(
      (item as { cardNumber?: string; productId?: string }).cardNumber ??
        (item as { productId?: string }).productId ??
        '',
    ).trim();
    if (!cardNumber) continue;
    const pulls = Array.isArray((item as { pulls?: unknown }).pulls)
      ? (item as { pulls: { deckId: number; productId?: string; qty: number }[] }).pulls.map((pull) => ({
          deckId: pull.deckId,
          productId: String(pull.productId ?? cardNumber),
          qty: pull.qty,
        }))
      : [];
    out.push({ cardNumber, pulls });
  }
  return out;
}

export const activationRoutes = new Hono<AppEnv>()
  // POST /api/decks/:id/activation-plan — dry run
  .post('/decks/:id/activation-plan', async (c) => {
    const userId = c.get('userId')!;
    const id = Number(c.req.param('id'));
    const body = await readJson<{ allowBox: boolean }>(c);
    const allowBox = parseAllowBox(body.allowBox);
    let plan;
    try {
      plan = await buildPlan(c.env, userId, id, { allowBox });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid activation options';
      return c.json({ error: message }, 400);
    }
    if (!plan) return c.json({ error: 'Deck not found' }, 404);
    return c.json({ data: plan });
  })

  // POST /api/decks/:id/activate — compute + apply
  .post('/decks/:id/activate', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const id = Number(c.req.param('id'));
    const body = await readJson<{ preferences: PullPreference[]; allowBox: boolean }>(c);
    const preferences = normalizePreferences(body.preferences);
    const allowBox = parseAllowBox(body.allowBox);
    let built;
    try {
      built = await buildPlanRaw(c.env, userId, id, { preferences, allowBox });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid source preferences';
      return c.json({ error: message }, 400);
    }
    if (!built) return c.json({ error: 'Deck not found' }, 404);
    await applyActivationPlan(db, built.plan);
    const enriched = await enrichPlan(c.env, built.plan);
    return c.json({ data: enriched });
  })

  // POST /api/decks/:id/deactivate — return copies to the box
  .post('/decks/:id/deactivate', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const id = Number(c.req.param('id'));
    const deck = await getOwnedDeck(db, userId, id);
    if (!deck) return c.json({ error: 'Deck not found' }, 404);
    await deactivateDeck(db, id);
    return c.json({ ok: true });
  })

  // GET /api/shopping — aggregated cards you still need to own across all decks
  .get('/shopping', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const owned = await getOwnedByProductId(db, userId);
    const states = await loadDeckStates(db, userId);

    const perCard = new Map<
      string,
      { maxRequired: number; decks: { deckId: number; name: string; required: number }[] }
    >();
    for (const d of states) {
      for (const [cardNumber, req] of Object.entries(d.required)) {
        const rec = perCard.get(cardNumber) ?? { maxRequired: 0, decks: [] };
        rec.decks.push({ deckId: d.deckId, name: d.name, required: req });
        rec.maxRequired = Math.max(rec.maxRequired, req);
        perCard.set(cardNumber, rec);
      }
    }

    const cardNumbers = [...perCard.keys()];
    const printingsByCardNumber = await getPrintingsByCardNumber(db, cardNumbers);
    const meta = await getCardMetaForCardNumbers(db, cardNumbers);
    const data = [...perCard.entries()]
      .map(([cardNumber, rec]) => {
        const printings = printingsByCardNumber[cardNumber] ?? [cardNumber];
        const have = sumOwnedForCardNumber(cardNumber, printings, owned);
        const card = meta.get(cardNumber);
        return {
          cardNumber,
          name: card?.name ?? cardNumber,
          owned: have,
          maxRequired: rec.maxRequired,
          missing: Math.max(0, rec.maxRequired - have),
          decks: rec.decks,
        };
      })
      .filter((r) => r.missing > 0)
      .sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name));

    return c.json({ data });
  })

  // GET /api/locations — paginated physical locations of owned printings
  .get('/locations', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const q = c.req.query();
    const limit = clamp(Number(q.limit) || 60, 1, 250);
    const offset = Math.max(0, Number(q.offset) || 0);
    try {
      const { total, rows } = await listCardLocations(db, userId, {
        limit,
        offset,
        q: q.q,
      });
      return c.json({
        _meta: { total, limit, offset, count: rows.length },
        data: rows,
      });
    } catch (err) {
      console.error('locations failed', err);
      return c.json(
        { error: err instanceof Error ? err.message : 'Failed to load locations' },
        500,
      );
    }
  })

  // PUT /api/locations/:productId — manually redistribute owned copies across box + decks
  .put('/locations/:productId', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const productId = decodeURIComponent(c.req.param('productId'));
    const body = await readJson<{ decks: { deckId: number; qty: number }[] }>(c);
    const deckQtys = Array.isArray(body.decks) ? body.decks : [];
    const result = await setCardLocation(db, userId, productId, deckQtys);
    if ('error' in result) return c.json({ error: result.error }, result.status);

    const locations = await getCardLocations(db, userId);
    const loc = locations[productId];
    if (!loc) return c.json({ error: 'Card not in collection' }, 404);
    const meta = await getCardMetaForProductIds(db, [productId]);
    return c.json({
      data: {
        productId,
        cardNumber: meta.get(productId)?.cardNumber ?? productId,
        name: meta.get(productId)?.name ?? productId,
        imageUrl: meta.get(productId)?.imageUrl ?? null,
        ...loc,
      },
    });
  });

async function buildPlanRaw(
  env: AppEnv['Bindings'],
  userId: number,
  id: number,
  options: ActivationOptions = {},
) {
  const db = getDb(env);
  const deck = await getOwnedDeck(db, userId, id);
  if (!deck) return null;
  const owned = await getOwnedByProductId(db, userId);
  const states = await loadDeckStates(db, userId);
  const cardNumbers = [...new Set(states.flatMap((s) => Object.keys(s.required)))];
  const printingsByCardNumber = await getPrintingsByCardNumber(db, cardNumbers);
  const plan = computeActivationPlan(
    { targetId: id, owned, printingsByCardNumber, decks: states },
    options,
  );
  return { plan };
}

async function buildPlan(
  env: AppEnv['Bindings'],
  userId: number,
  id: number,
  options: ActivationOptions = {},
) {
  const built = await buildPlanRaw(env, userId, id, options);
  if (!built) return null;
  return enrichPlan(env, built.plan);
}

/** Attach card names for the SYSTEM SWAP terminal log. */
async function enrichPlan(env: AppEnv['Bindings'], plan: ActivationPlan) {
  const db = getDb(env);
  const cardNumbers = new Set<string>();
  const productIds = new Set<string>();
  for (const s of plan.shortages) cardNumbers.add(s.cardNumber);
  for (const option of plan.pullOptions) cardNumbers.add(option.cardNumber);
  for (const m of plan.moves) productIds.add(m.productId);
  for (const a of plan.affectedDecks) for (const p of a.pulled) productIds.add(p.productId);
  for (const option of plan.pullOptions) for (const h of option.holders) productIds.add(h.productId);

  const metaByCard = await getCardMetaForCardNumbers(db, [...cardNumbers]);
  const metaByProduct = await getCardMetaForProductIds(db, [...productIds]);
  const nameOfCard = (cardNumber: string) => {
    const meta = metaByCard.get(cardNumber);
    return meta ? `${meta.name} (${cardNumber})` : cardNumber;
  };
  const nameOfProduct = (productId: string) => {
    const meta = metaByProduct.get(productId);
    if (!meta) return productId;
    return productId !== meta.cardNumber
      ? `${meta.name} (${meta.cardNumber} · ${productId})`
      : `${meta.name} (${meta.cardNumber})`;
  };

  return {
    ...plan,
    moves: plan.moves.map((m) => ({ ...m, name: nameOfProduct(m.productId) })),
    shortages: plan.shortages.map((s) => ({
      ...s,
      name: nameOfCard(s.cardNumber),
    })),
    pullOptions: plan.pullOptions.map((option) => ({
      ...option,
      name: nameOfCard(option.cardNumber),
    })),
    affectedDecks: plan.affectedDecks.map((a) => ({
      ...a,
      pulled: a.pulled.map((p) => ({ ...p, name: nameOfProduct(p.productId) })),
    })),
  };
}
