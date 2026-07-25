/**
 * Physical-copy allocation / "active deck swap" engine.
 *
 * Copies are tracked per product_id (specific printing). A deck's `alloc` is the copies
 * physically placed in it. Free copies in the box = owned(productId) - sum(alloc).
 *
 * Activating a deck fills its allocation to its required composition, taking copies from the
 * box first (unless `allowBox` is false) and then pulling from OTHER decks (which become
 * incomplete and are deactivated). Copies that simply are not owned become purchase "shortages".
 *
 * The `computeActivationPlan` function is pure so it can be unit-tested without D1.
 */

export interface DeckState {
  deckId: number;
  name: string;
  isActive: boolean;
  updatedAt: number;
  /** product_id -> desired quantity */
  required: Record<string, number>;
  /** product_id -> currently allocated quantity */
  alloc: Record<string, number>;
}

export interface EngineInput {
  targetId: number;
  /** product_id -> owned copies of that printing */
  owned: Record<string, number>;
  decks: DeckState[];
}

export interface PullPreference {
  productId: string;
  pulls: { deckId: number; qty: number }[];
}

export interface ActivationOptions {
  preferences?: PullPreference[];
  /** When false, skip free box copies and pull only from other decks. Default true. */
  allowBox?: boolean;
}

export interface PullOption {
  productId: string;
  /** Copies that must be pulled from decks after using all free box copies. */
  qty: number;
  holders: {
    deckId: number;
    name: string;
    qty: number;
    isActive: boolean;
  }[];
}

export type MoveSource = 'box' | { deckId: number; name: string };

export interface Move {
  productId: string;
  from: MoveSource;
  qty: number;
}

export interface AffectedDeck {
  deckId: number;
  name: string;
  wasActive: boolean;
  pulled: { productId: string; qty: number }[];
}

export interface Shortage {
  productId: string;
  required: number;
  owned: number;
  missing: number;
}

export interface ActivationPlan {
  targetId: number;
  targetName: string;
  moves: Move[];
  affectedDecks: AffectedDeck[];
  shortages: Shortage[];
  /** Cards whose required deck pulls can be distributed between alternative sources. */
  pullOptions: PullOption[];
  /** Whether free box copies were considered for this plan. */
  allowBox: boolean;
  /** true if the deck can be fully assembled from owned copies */
  complete: boolean;
  /** final allocation the target deck will hold: product_id -> qty */
  targetAllocation: Record<string, number>;
}

export function computeActivationPlan(
  input: EngineInput,
  options: ActivationOptions = {},
): ActivationPlan {
  const { preferences = [], allowBox = true } = options;
  const { targetId, owned, decks } = input;
  const target = decks.find((d) => d.deckId === targetId);
  if (!target) throw new Error(`Target deck ${targetId} not found`);
  const others = decks.filter((d) => d.deckId !== targetId);
  const preferenceByProduct = new Map<string, PullPreference>();
  for (const preference of preferences) {
    if (preferenceByProduct.has(preference.productId)) {
      throw new Error(`Duplicate source preference for ${preference.productId}`);
    }
    preferenceByProduct.set(preference.productId, preference);
  }
  const usedPreferences = new Set<string>();

  // Total copies of each printing currently allocated across ALL decks.
  const allocatedTotal: Record<string, number> = {};
  for (const d of decks) {
    for (const [cn, q] of Object.entries(d.alloc)) {
      allocatedTotal[cn] = (allocatedTotal[cn] ?? 0) + q;
    }
  }

  const moves: Move[] = [];
  const shortages: Shortage[] = [];
  const pullOptions: PullOption[] = [];
  const targetAllocation: Record<string, number> = {};
  const affected = new Map<number, AffectedDeck>();

  // Mutable working copies of other decks' allocations (so we don't pull the same copy twice).
  const otherAlloc = new Map<number, Record<string, number>>();
  for (const d of others) otherAlloc.set(d.deckId, { ...d.alloc });

  for (const [productId, reqRaw] of Object.entries(target.required)) {
    const req = reqRaw;
    const ownedCopies = owned[productId] ?? 0;
    const cur = target.alloc[productId] ?? 0;
    const boxFree = ownedCopies - (allocatedTotal[productId] ?? 0); // copies in no deck at all

    // Keep what the target already holds; optionally take additional copies from the box first.
    const takeBox = allowBox
      ? Math.max(0, Math.min(req - cur, Math.max(0, boxFree)))
      : 0;
    if (takeBox > 0) moves.push({ productId, from: 'box', qty: takeBox });
    let got = cur + takeBox;
    let remaining = req - got;

    if (remaining > 0) {
      // Pull from other decks holding this card: inactive decks first, then oldest active.
      const holders = others
        .filter((d) => (otherAlloc.get(d.deckId)?.[productId] ?? 0) > 0)
        .sort((a, b) => Number(a.isActive) - Number(b.isActive) || a.updatedAt - b.updatedAt);

      const totalAvailable = holders.reduce(
        (sum, holder) => sum + (otherAlloc.get(holder.deckId)?.[productId] ?? 0),
        0,
      );
      const pullQty = Math.min(remaining, totalAvailable);
      if (pullQty > 0 && holders.length > 1 && totalAvailable > pullQty) {
        pullOptions.push({
          productId,
          qty: pullQty,
          holders: holders.map((holder) => ({
            deckId: holder.deckId,
            name: holder.name,
            qty: otherAlloc.get(holder.deckId)?.[productId] ?? 0,
            isActive: holder.isActive,
          })),
        });
      }

      const preference = preferenceByProduct.get(productId);
      let selectedHolders = holders.map((holder) => ({
        holder,
        qty: otherAlloc.get(holder.deckId)?.[productId] ?? 0,
      }));
      if (preference) {
        usedPreferences.add(productId);
        const seenDecks = new Set<number>();
        let selectedTotal = 0;
        selectedHolders = preference.pulls.map((selected) => {
          if (
            !Number.isInteger(selected.deckId) ||
            !Number.isInteger(selected.qty) ||
            selected.qty < 0 ||
            seenDecks.has(selected.deckId)
          ) {
            throw new Error(`Invalid source preference for ${productId}`);
          }
          seenDecks.add(selected.deckId);
          const holder = holders.find((candidate) => candidate.deckId === selected.deckId);
          const available = holder ? (otherAlloc.get(holder.deckId)?.[productId] ?? 0) : 0;
          if (!holder || selected.qty > available) {
            throw new Error(`Source preference for ${productId} exceeds available copies`);
          }
          selectedTotal += selected.qty;
          return { holder, qty: selected.qty };
        });
        if (selectedTotal !== pullQty) {
          throw new Error(`Source preference for ${productId} must allocate ${pullQty} copies`);
        }
      }

      for (const selected of selectedHolders) {
        if (remaining <= 0) break;
        const h = selected.holder;
        const hAlloc = otherAlloc.get(h.deckId)!;
        const avail = hAlloc[productId] ?? 0;
        const pull = Math.min(remaining, avail, selected.qty);
        if (pull <= 0) continue;
        hAlloc[productId] = avail - pull;
        moves.push({ productId, from: { deckId: h.deckId, name: h.name }, qty: pull });
        const rec = affected.get(h.deckId) ?? {
          deckId: h.deckId,
          name: h.name,
          wasActive: h.isActive,
          pulled: [],
        };
        rec.pulled.push({ productId, qty: pull });
        affected.set(h.deckId, rec);
        remaining -= pull;
        got += pull;
      }
    }

    if (remaining > 0) {
      shortages.push({ productId, required: req, owned: ownedCopies, missing: remaining });
    }
    targetAllocation[productId] = got;
  }

  for (const productId of preferenceByProduct.keys()) {
    if (!usedPreferences.has(productId)) {
      throw new Error(`No deck source selection is needed for ${productId}`);
    }
  }

  return {
    targetId,
    targetName: target.name,
    moves,
    affectedDecks: [...affected.values()],
    shortages,
    pullOptions,
    allowBox,
    complete: shortages.length === 0,
    targetAllocation,
  };
}
