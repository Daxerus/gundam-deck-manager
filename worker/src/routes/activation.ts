import { Hono } from 'hono';
import type { AppEnv } from '../auth';
import { getDb } from '../db/client';
import {
  computeActivationPlan,
  type ActivationOptions,
  type ActivationPlan,
  type PullPreference,
} from '../services/allocation';
import {
  applyActivationPlan,
  deactivateDeck,
  getCardLocations,
  getCardMetaForProductIds,
  getOwnedByProductId,
  loadDeckStates,
  setCardLocation,
} from '../services/deckState';
import { getOwnedDeck } from '../services/scope';
import { readJson } from '../util/json';

function parseAllowBox(value: unknown): boolean {
  return value !== false;
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
    const preferences = Array.isArray(body.preferences) ? body.preferences : [];
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
      for (const [productId, req] of Object.entries(d.required)) {
        const rec = perCard.get(productId) ?? { maxRequired: 0, decks: [] };
        rec.decks.push({ deckId: d.deckId, name: d.name, required: req });
        rec.maxRequired = Math.max(rec.maxRequired, req);
        perCard.set(productId, rec);
      }
    }

    const meta = await getCardMetaForProductIds(db, [...perCard.keys()]);
    const data = [...perCard.entries()]
      .map(([productId, rec]) => {
        const have = owned[productId] ?? 0;
        const card = meta.get(productId);
        return {
          productId,
          cardNumber: card?.cardNumber ?? productId,
          name: card?.name ?? productId,
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

  // GET /api/locations — physical location of every owned printing
  .get('/locations', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const locations = await getCardLocations(db, userId);
    const productIds = Object.keys(locations);
    const meta = await getCardMetaForProductIds(db, productIds);
    const data = productIds
      .map((productId) => ({
        productId,
        cardNumber: meta.get(productId)?.cardNumber ?? productId,
        name: meta.get(productId)?.name ?? productId,
        imageUrl: meta.get(productId)?.imageUrl ?? null,
        ...locations[productId],
      }))
      .sort((a, b) => a.cardNumber.localeCompare(b.cardNumber) || a.productId.localeCompare(b.productId));
    return c.json({ data });
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
  const plan = computeActivationPlan({ targetId: id, owned, decks: states }, options);
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

/** Attach card names to a plan for display in the SYSTEM SWAP terminal log. */
async function enrichPlan(env: AppEnv['Bindings'], plan: ActivationPlan) {
  const db = getDb(env);
  const productIds = new Set<string>();
  for (const m of plan.moves) productIds.add(m.productId);
  for (const s of plan.shortages) productIds.add(s.productId);
  for (const option of plan.pullOptions) productIds.add(option.productId);
  for (const a of plan.affectedDecks) for (const p of a.pulled) productIds.add(p.productId);
  const meta = await getCardMetaForProductIds(db, [...productIds]);
  const nameOf = (productId: string) => meta.get(productId)?.name ?? productId;

  return {
    ...plan,
    moves: plan.moves.map((m) => ({ ...m, name: nameOf(m.productId) })),
    shortages: plan.shortages.map((s) => ({ ...s, name: nameOf(s.productId) })),
    pullOptions: plan.pullOptions.map((option) => ({
      ...option,
      name: nameOf(option.productId),
    })),
    affectedDecks: plan.affectedDecks.map((a) => ({
      ...a,
      pulled: a.pulled.map((p) => ({ ...p, name: nameOf(p.productId) })),
    })),
  };
}
