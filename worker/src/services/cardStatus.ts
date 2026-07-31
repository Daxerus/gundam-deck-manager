export type StatusColor = 'green' | 'yellow' | 'red';

export type LoanPartyQty = {
  /** Registered counterparty; null for external contacts. */
  userId: number | null;
  /** External contact id; null for registered users. */
  contactId: number | null;
  /** Username or external nick. */
  username: string;
  qty: number;
  loanId: number;
};

export type CardStatusBreakdown = {
  productId: string;
  owned: number;
  box: number;
  decks: { deckId: number; name: string; qty: number }[];
  lentOut: LoanPartyQty[];
  borrowedIn: LoanPartyQty[];
  statusColor: StatusColor;
  displayQty: number;
  ownTotal: number;
};

/** Pure status-color rules from the roadmap. */
export function computeStatusColor(opts: {
  ownTotal: number;
  ownInDecks: number;
  hasLoans: boolean;
}): StatusColor {
  const { ownTotal, ownInDecks, hasLoans } = opts;
  if (hasLoans) return 'yellow';
  if (ownTotal <= 0) return 'green';
  if (ownInDecks >= ownTotal) return 'red';
  if (ownInDecks > 0) return 'yellow';
  return 'green';
}

/**
 * Build helper rows so quantities sum to displayQty (owned + lentOut).
 * Borrowed copies are shown as purple and removed from box/deck display.
 */
export function buildCardStatusBreakdown(input: {
  productId: string;
  owned: number;
  deckAlloc: { deckId: number; name: string; qty: number }[];
  lentOut: LoanPartyQty[];
  borrowedIn: LoanPartyQty[];
}): CardStatusBreakdown {
  const owned = Math.max(0, input.owned);
  const lentOutTotal = input.lentOut.reduce((s, r) => s + r.qty, 0);
  const borrowedInTotal = input.borrowedIn.reduce((s, r) => s + r.qty, 0);
  const ownTotal = Math.max(0, owned - borrowedInTotal);
  const allocTotal = input.deckAlloc.reduce((s, d) => s + d.qty, 0);
  const ownInDecks = Math.min(allocTotal, ownTotal);
  const ownInBox = ownTotal - ownInDecks;

  // Scale deck rows to own copies only (borrowed portion hidden in purple rows).
  let decks: { deckId: number; name: string; qty: number }[] = [];
  if (ownInDecks > 0 && allocTotal > 0) {
    if (ownInDecks === allocTotal) {
      decks = input.deckAlloc.filter((d) => d.qty > 0);
    } else {
      let remaining = ownInDecks;
      for (const d of input.deckAlloc) {
        if (remaining <= 0 || d.qty <= 0) continue;
        const take = Math.min(d.qty, remaining);
        decks.push({ deckId: d.deckId, name: d.name, qty: take });
        remaining -= take;
      }
    }
  }

  const hasLoans = lentOutTotal > 0 || borrowedInTotal > 0;
  const statusColor = computeStatusColor({ ownTotal: ownTotal + lentOutTotal, ownInDecks, hasLoans });

  return {
    productId: input.productId,
    owned,
    box: ownInBox,
    decks,
    lentOut: input.lentOut.filter((r) => r.qty > 0),
    borrowedIn: input.borrowedIn.filter((r) => r.qty > 0),
    statusColor,
    displayQty: owned + lentOutTotal,
    ownTotal: ownTotal + lentOutTotal,
  };
}

function partyKey(r: LoanPartyQty): string {
  if (r.contactId != null) return `c:${r.contactId}`;
  if (r.userId != null) return `u:${r.userId}`;
  return `n:${r.username}`;
}

/** Group loan party rows by user or contact, summing qty (keeps first loanId). */
export function groupLoanParties(rows: LoanPartyQty[]): LoanPartyQty[] {
  const map = new Map<string, LoanPartyQty>();
  for (const r of rows) {
    const key = partyKey(r);
    const prev = map.get(key);
    if (prev) {
      prev.qty += r.qty;
    } else {
      map.set(key, { ...r });
    }
  }
  return [...map.values()].filter((r) => r.qty > 0);
}
