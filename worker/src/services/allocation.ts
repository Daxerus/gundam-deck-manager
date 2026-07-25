/**
 * Physical-copy allocation / "active deck swap" engine.
 *
 * Deck composition (`required`) is keyed by card_number; physical copies (`alloc`, `owned`)
 * remain keyed by product_id. Activating a deck assigns concrete printings to satisfy each
 * card_number requirement, taking from the box first and then other decks.
 */

export interface DeckState {
  deckId: number;
  name: string;
  isActive: boolean;
  updatedAt: number;
  /** card_number -> desired quantity */
  required: Record<string, number>;
  /** product_id -> currently allocated quantity */
  alloc: Record<string, number>;
}

export interface EngineInput {
  targetId: number;
  /** product_id -> owned copies of that printing */
  owned: Record<string, number>;
  /** card_number -> product_ids (sorted ascending, base printing first) */
  printingsByCardNumber: Record<string, string[]>;
  decks: DeckState[];
}

export interface PullPreference {
  cardNumber: string;
  pulls: { deckId: number; productId: string; qty: number }[];
}

export interface ActivationOptions {
  preferences?: PullPreference[];
  /** When false, skip free box copies and pull only from other decks. Default true. */
  allowBox?: boolean;
}

export interface PullOption {
  cardNumber: string;
  /** Copies that must be pulled from decks after using all free box copies. */
  qty: number;
  holders: {
    deckId: number;
    name: string;
    productId: string;
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
  cardNumber: string;
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
  pullOptions: PullOption[];
  allowBox: boolean;
  complete: boolean;
  /** final allocation the target deck will hold: product_id -> qty */
  targetAllocation: Record<string, number>;
}

interface PullSource {
  holder: DeckState;
  productId: string;
  qty: number;
}

export function sumOwnedForCardNumber(
  cardNumber: string,
  printings: string[],
  owned: Record<string, number>,
): number {
  return printings.reduce((sum, productId) => sum + (owned[productId] ?? 0), 0);
}

export function sumAllocatedForCardNumber(
  cardNumber: string,
  printings: string[],
  alloc: Record<string, number>,
): number {
  return printings.reduce((sum, productId) => sum + (alloc[productId] ?? 0), 0);
}

function sortPrintingsForBox(
  printings: string[],
  targetAlloc: Record<string, number>,
  boxFree: Record<string, number>,
): string[] {
  return [...printings].sort((a, b) => {
    const inTargetA = (targetAlloc[a] ?? 0) > 0 ? 0 : 1;
    const inTargetB = (targetAlloc[b] ?? 0) > 0 ? 0 : 1;
    if (inTargetA !== inTargetB) return inTargetA - inTargetB;
    if (a !== b) return a.localeCompare(b);
    return (boxFree[b] ?? 0) - (boxFree[a] ?? 0);
  });
}

function addToMap(map: Record<string, number>, key: string, qty: number) {
  if (qty <= 0) return;
  map[key] = (map[key] ?? 0) + qty;
}

function recordPull(
  affected: Map<number, AffectedDeck>,
  holder: DeckState,
  productId: string,
  qty: number,
  moves: Move[],
) {
  moves.push({ productId, from: { deckId: holder.deckId, name: holder.name }, qty });
  const rec = affected.get(holder.deckId) ?? {
    deckId: holder.deckId,
    name: holder.name,
    wasActive: holder.isActive,
    pulled: [],
  };
  rec.pulled.push({ productId, qty });
  affected.set(holder.deckId, rec);
}

export function computeActivationPlan(
  input: EngineInput,
  options: ActivationOptions = {},
): ActivationPlan {
  const { preferences = [], allowBox = true } = options;
  const { targetId, owned, printingsByCardNumber, decks } = input;
  const target = decks.find((d) => d.deckId === targetId);
  if (!target) throw new Error(`Target deck ${targetId} not found`);
  const others = decks.filter((d) => d.deckId !== targetId);
  const preferenceByCard = new Map<string, PullPreference>();
  for (const preference of preferences) {
    if (preferenceByCard.has(preference.cardNumber)) {
      throw new Error(`Duplicate source preference for ${preference.cardNumber}`);
    }
    preferenceByCard.set(preference.cardNumber, preference);
  }
  const usedPreferences = new Set<string>();

  const allocatedTotal: Record<string, number> = {};
  for (const d of decks) {
    for (const [productId, q] of Object.entries(d.alloc)) {
      allocatedTotal[productId] = (allocatedTotal[productId] ?? 0) + q;
    }
  }

  const moves: Move[] = [];
  const shortages: Shortage[] = [];
  const pullOptions: PullOption[] = [];
  const targetAllocation: Record<string, number> = { ...target.alloc };
  const affected = new Map<number, AffectedDeck>();

  const otherAlloc = new Map<number, Record<string, number>>();
  for (const d of others) otherAlloc.set(d.deckId, { ...d.alloc });

  for (const [cardNumber, req] of Object.entries(target.required)) {
    const printings = printingsByCardNumber[cardNumber] ?? [cardNumber];
    const ownedTotal = sumOwnedForCardNumber(cardNumber, printings, owned);
    let got = sumAllocatedForCardNumber(cardNumber, printings, targetAllocation);
    let remaining = req - got;

    if (remaining > 0 && allowBox) {
      const boxFree: Record<string, number> = {};
      for (const productId of printings) {
        boxFree[productId] = Math.max(0, (owned[productId] ?? 0) - (allocatedTotal[productId] ?? 0));
      }
      for (const productId of sortPrintingsForBox(printings, targetAllocation, boxFree)) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, boxFree[productId] ?? 0);
        if (take <= 0) continue;
        moves.push({ productId, from: 'box', qty: take });
        addToMap(targetAllocation, productId, take);
        allocatedTotal[productId] = (allocatedTotal[productId] ?? 0) + take;
        got += take;
        remaining -= take;
      }
    }

    if (remaining > 0) {
      const sources: PullSource[] = [];
      for (const holder of others) {
        const hAlloc = otherAlloc.get(holder.deckId)!;
        for (const productId of printings) {
          const qty = hAlloc[productId] ?? 0;
          if (qty > 0) sources.push({ holder, productId, qty });
        }
      }
      sources.sort(
        (a, b) =>
          Number(a.holder.isActive) - Number(b.holder.isActive) ||
          a.holder.updatedAt - b.holder.updatedAt ||
          a.holder.deckId - b.holder.deckId ||
          a.productId.localeCompare(b.productId),
      );

      const totalAvailable = sources.reduce((sum, source) => sum + source.qty, 0);
      const pullQty = Math.min(remaining, totalAvailable);
      if (pullQty > 0 && sources.length > 1 && totalAvailable > pullQty) {
        pullOptions.push({
          cardNumber,
          qty: pullQty,
          holders: sources.map((source) => ({
            deckId: source.holder.deckId,
            name: source.holder.name,
            productId: source.productId,
            qty: source.qty,
            isActive: source.holder.isActive,
          })),
        });
      }

      const preference = preferenceByCard.get(cardNumber);
      let selectedSources = sources.map((source) => ({ source, qty: source.qty }));
      if (preference) {
        usedPreferences.add(cardNumber);
        const seen = new Set<string>();
        let selectedTotal = 0;
        selectedSources = preference.pulls.map((selected) => {
          const key = `${selected.deckId}:${selected.productId}`;
          if (
            !Number.isInteger(selected.deckId) ||
            !selected.productId ||
            !Number.isInteger(selected.qty) ||
            selected.qty < 0 ||
            seen.has(key)
          ) {
            throw new Error(`Invalid source preference for ${cardNumber}`);
          }
          seen.add(key);
          const match = sources.find(
            (source) =>
              source.holder.deckId === selected.deckId && source.productId === selected.productId,
          );
          if (!match || selected.qty > match.qty) {
            throw new Error(`Source preference for ${cardNumber} exceeds available copies`);
          }
          selectedTotal += selected.qty;
          return { source: match, qty: selected.qty };
        });
        if (selectedTotal !== pullQty) {
          throw new Error(`Source preference for ${cardNumber} must allocate ${pullQty} copies`);
        }
      }

      for (const selected of selectedSources) {
        if (remaining <= 0) break;
        const { source } = selected;
        const hAlloc = otherAlloc.get(source.holder.deckId)!;
        const avail = hAlloc[source.productId] ?? 0;
        const pull = Math.min(remaining, avail, selected.qty);
        if (pull <= 0) continue;
        hAlloc[source.productId] = avail - pull;
        recordPull(affected, source.holder, source.productId, pull, moves);
        addToMap(targetAllocation, source.productId, pull);
        got += pull;
        remaining -= pull;
      }
    }

    if (remaining > 0) {
      shortages.push({ cardNumber, required: req, owned: ownedTotal, missing: remaining });
    }
  }

  for (const cardNumber of preferenceByCard.keys()) {
    if (!usedPreferences.has(cardNumber)) {
      throw new Error(`No deck source selection is needed for ${cardNumber}`);
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
