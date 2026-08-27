import type { CardStatusBreakdown, LoanPartyQty, StatusColor } from './types';

/** Mirrors the worker's computeStatusColor so merged rows keep the same colour rules. */
function mergedStatusColor(opts: {
  ownTotal: number;
  ownInDecks: number;
  hasLoans: boolean;
}): StatusColor {
  if (opts.hasLoans) return 'yellow';
  if (opts.ownTotal <= 0) return 'green';
  if (opts.ownInDecks >= opts.ownTotal) return 'red';
  if (opts.ownInDecks > 0) return 'yellow';
  return 'green';
}

function totalQty(rows: { qty: number }[]): number {
  return rows.reduce((total, row) => total + row.qty, 0);
}

/**
 * Re-derive a breakdown for an owned quantity that only exists in the local draft, so the
 * tile shows the edited amount before the bulk save lands. Mirrors the worker's
 * buildCardStatusBreakdown: loans stay untouched and deck rows shrink to the own copies left.
 */
export function withDraftOwned(
  status: CardStatusBreakdown | undefined,
  productId: string,
  draftOwned: number,
): CardStatusBreakdown | undefined {
  const owned = Math.max(0, draftOwned);
  if (!status) {
    if (owned <= 0) return undefined;
    return {
      productId,
      owned,
      box: owned,
      decks: [],
      lentOut: [],
      borrowedIn: [],
      statusColor: 'green',
      displayQty: owned,
      ownTotal: owned,
    };
  }

  const lentOutTotal = totalQty(status.lentOut);
  const borrowedInTotal = totalQty(status.borrowedIn);
  const ownTotal = Math.max(0, owned - borrowedInTotal);
  const allocTotal = totalQty(status.decks);
  const ownInDecks = Math.min(allocTotal, ownTotal);

  let decks = status.decks;
  if (ownInDecks < allocTotal) {
    decks = [];
    let remaining = ownInDecks;
    for (const deck of status.decks) {
      if (remaining <= 0 || deck.qty <= 0) continue;
      const take = Math.min(deck.qty, remaining);
      decks.push({ ...deck, qty: take });
      remaining -= take;
    }
  }

  return {
    ...status,
    owned,
    box: ownTotal - ownInDecks,
    decks,
    statusColor: mergedStatusColor({
      ownTotal: ownTotal + lentOutTotal,
      ownInDecks,
      hasLoans: lentOutTotal > 0 || borrowedInTotal > 0,
    }),
    displayQty: owned + lentOutTotal,
    ownTotal: ownTotal + lentOutTotal,
  };
}

function partyKey(row: LoanPartyQty): string {
  if (row.contactId != null) return `c:${row.contactId}`;
  if (row.userId != null) return `u:${row.userId}`;
  return `n:${row.username}`;
}

function mergeLoanParties(rows: LoanPartyQty[]): LoanPartyQty[] {
  const byParty = new Map<string, LoanPartyQty>();
  for (const row of rows) {
    const key = partyKey(row);
    const prev = byParty.get(key);
    if (prev) prev.qty += row.qty;
    else byParty.set(key, { ...row });
  }
  return [...byParty.values()].filter((r) => r.qty > 0);
}

/**
 * Collapse the per-printing breakdowns of one card_number into a single view, so copies
 * count per card (1 LR + 2 LR+ = 3) as deck composition does. `productId` keeps the
 * representative printing because CardTile derives its animation ids from it.
 */
export function mergeCardStatus(
  productId: string,
  parts: (CardStatusBreakdown | undefined)[],
): CardStatusBreakdown | undefined {
  const present = parts.filter((p): p is CardStatusBreakdown => p != null);
  if (present.length === 0) return undefined;

  const decks = new Map<number, { deckId: number; name: string; qty: number }>();
  for (const part of present) {
    for (const deck of part.decks) {
      const prev = decks.get(deck.deckId);
      if (prev) prev.qty += deck.qty;
      else decks.set(deck.deckId, { ...deck });
    }
  }

  const lentOut = mergeLoanParties(present.flatMap((p) => p.lentOut));
  const borrowedIn = mergeLoanParties(present.flatMap((p) => p.borrowedIn));
  const sum = (pick: (p: CardStatusBreakdown) => number) =>
    present.reduce((total, part) => total + pick(part), 0);
  const ownTotal = sum((p) => p.ownTotal);
  const ownInDecks = [...decks.values()].reduce((total, deck) => total + deck.qty, 0);

  return {
    productId,
    owned: sum((p) => p.owned),
    box: sum((p) => p.box),
    decks: [...decks.values()],
    lentOut,
    borrowedIn,
    statusColor: mergedStatusColor({
      ownTotal,
      ownInDecks,
      hasLoans: lentOut.length > 0 || borrowedIn.length > 0,
    }),
    displayQty: sum((p) => p.displayQty),
    ownTotal,
  };
}
