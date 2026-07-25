import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DB } from '../db/client';
import { allocations, cards, collectionItems, deckCards, decks } from '../db/schema';
import type { ActivationPlan, DeckState } from './allocation';
import type { CardMeta } from './validation';

/** Owned physical copies keyed by product_id (specific printing) for one user. */
export async function getOwnedByProductId(
  db: DB,
  userId: number,
): Promise<Record<string, number>> {
  const rows = await db
    .select()
    .from(collectionItems)
    .where(eq(collectionItems.userId, userId))
    .all();
  const out: Record<string, number> = {};
  for (const r of rows) out[r.productId] = Number(r.quantity) || 0;
  return out;
}

/** Load a user's decks with their required composition and current allocations. */
export async function loadDeckStates(db: DB, userId: number): Promise<DeckState[]> {
  const deckRows = await db.select().from(decks).where(eq(decks.userId, userId)).all();
  if (deckRows.length === 0) return [];

  const deckIds = deckRows.map((d) => d.id);
  const dcRows = await db.select().from(deckCards).where(inArray(deckCards.deckId, deckIds)).all();
  const allocRows = await db
    .select()
    .from(allocations)
    .where(inArray(allocations.deckId, deckIds))
    .all();

  const byId = new Map<number, DeckState>();
  for (const d of deckRows) {
    byId.set(d.id, {
      deckId: d.id,
      name: d.name,
      isActive: d.isActive,
      updatedAt: d.updatedAt,
      required: {},
      alloc: {},
    });
  }
  for (const dc of dcRows) {
    const s = byId.get(dc.deckId);
    if (s) s.required[dc.productId] = dc.quantity;
  }
  for (const a of allocRows) {
    const s = byId.get(a.deckId);
    if (s && a.quantity > 0) s.alloc[a.productId] = a.quantity;
  }
  return [...byId.values()];
}

/** Card metadata keyed by product_id (specific printing). */
export async function getCardMetaForProductIds(
  db: DB,
  productIds: string[],
): Promise<Map<string, CardMeta>> {
  const map = new Map<string, CardMeta>();
  if (productIds.length === 0) return map;
  const rows = await db
    .select({
      productId: cards.productId,
      cardNumber: cards.cardNumber,
      color: cards.color,
      cardType: cards.cardType,
      name: cards.name,
      imageUrl: cards.imageUrl,
    })
    .from(cards)
    .where(inArray(cards.productId, productIds))
    .all();
  for (const r of rows) {
    map.set(r.productId, {
      cardNumber: r.cardNumber,
      color: r.color,
      cardType: r.cardType,
      name: r.name,
      imageUrl: r.imageUrl,
    });
  }
  return map;
}

/** Persist an activation plan: fill target, cannibalize affected decks, update active flags. */
export async function applyActivationPlan(db: DB, plan: ActivationPlan): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const stmts = [];

  // Reset + set target allocations.
  stmts.push(db.delete(allocations).where(eq(allocations.deckId, plan.targetId)));
  for (const [productId, qty] of Object.entries(plan.targetAllocation)) {
    if (qty > 0) {
      stmts.push(db.insert(allocations).values({ deckId: plan.targetId, productId, quantity: qty }));
    }
  }
  stmts.push(db.update(decks).set({ isActive: true, updatedAt: now }).where(eq(decks.id, plan.targetId)));

  // Reduce affected decks and deactivate them (they became incomplete).
  for (const aff of plan.affectedDecks) {
    for (const p of aff.pulled) {
      stmts.push(
        db
          .update(allocations)
          .set({ quantity: sql`${allocations.quantity} - ${p.qty}` })
          .where(sql`${allocations.deckId} = ${aff.deckId} and ${allocations.productId} = ${p.productId}`),
      );
    }
    stmts.push(db.update(decks).set({ isActive: false, updatedAt: now }).where(eq(decks.id, aff.deckId)));
  }
  // Clean up any zeroed allocations.
  stmts.push(db.delete(allocations).where(eq(allocations.quantity, 0)));

  await db.batch(stmts as [(typeof stmts)[number], ...typeof stmts]);
}

/** Deactivate a deck: return all its copies to the box. */
export async function deactivateDeck(db: DB, deckId: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.delete(allocations).where(eq(allocations.deckId, deckId)),
    db.update(decks).set({ isActive: false, updatedAt: now }).where(eq(decks.id, deckId)),
  ]);
}

/** Where each owned printing physically sits: box + per-deck allocations (one user). */
export async function getCardLocations(
  db: DB,
  userId: number,
): Promise<
  Record<string, { owned: number; box: number; decks: { deckId: number; name: string; qty: number }[] }>
> {
  const owned = await getOwnedByProductId(db, userId);
  const deckRows = await db.select().from(decks).where(eq(decks.userId, userId)).all();
  const deckName = new Map(deckRows.map((d) => [d.id, d.name] as const));
  const deckIds = deckRows.map((d) => d.id);
  const allocRows =
    deckIds.length === 0
      ? []
      : await db.select().from(allocations).where(inArray(allocations.deckId, deckIds)).all();

  const out: Record<
    string,
    { owned: number; box: number; decks: { deckId: number; name: string; qty: number }[] }
  > = {};
  for (const [productId, n] of Object.entries(owned)) {
    out[productId] = { owned: n, box: n, decks: [] };
  }
  for (const a of allocRows) {
    if (a.quantity <= 0) continue;
    if (!out[a.productId]) {
      out[a.productId] = { owned: owned[a.productId] ?? 0, box: owned[a.productId] ?? 0, decks: [] };
    }
    out[a.productId].decks.push({
      deckId: a.deckId,
      name: deckName.get(a.deckId) ?? `#${a.deckId}`,
      qty: a.quantity,
    });
    out[a.productId].box -= a.quantity;
  }
  return out;
}

/**
 * Manually set where owned copies of a printing sit.
 * `deckQtys` lists per-deck quantities; remaining copies stay in the box (colección).
 * Does not change deck active flags — pure location correction.
 */
export async function setCardLocation(
  db: DB,
  userId: number,
  productId: string,
  deckQtys: { deckId: number; qty: number }[],
): Promise<{ ok: true } | { error: string; status: 400 | 404 }> {
  const ownedMap = await getOwnedByProductId(db, userId);
  const owned = ownedMap[productId] ?? 0;
  if (owned <= 0) return { error: 'Card not in collection', status: 404 };

  const deckRows = await db.select().from(decks).where(eq(decks.userId, userId)).all();
  const userDeckIds = new Set(deckRows.map((d) => d.id));

  const byDeck = new Map<number, number>();
  for (const d of deckQtys) {
    const deckId = Number(d.deckId);
    const qty = Math.max(0, Math.floor(Number(d.qty) || 0));
    if (!Number.isInteger(deckId) || deckId < 1) return { error: 'Invalid deck', status: 400 };
    if (!userDeckIds.has(deckId)) return { error: 'Deck not found', status: 400 };
    if (qty === 0) continue;
    byDeck.set(deckId, (byDeck.get(deckId) ?? 0) + qty);
  }

  let allocated = 0;
  for (const qty of byDeck.values()) allocated += qty;
  if (allocated > owned) return { error: 'Allocation exceeds owned copies', status: 400 };

  const deckIds = [...userDeckIds];
  const stmts = [];
  if (deckIds.length > 0) {
    stmts.push(
      db
        .delete(allocations)
        .where(and(eq(allocations.productId, productId), inArray(allocations.deckId, deckIds))),
    );
  }
  for (const [deckId, quantity] of byDeck) {
    stmts.push(db.insert(allocations).values({ deckId, productId, quantity }));
  }
  if (stmts.length > 0) {
    await db.batch(stmts as [(typeof stmts)[number], ...typeof stmts]);
  }
  return { ok: true };
}
