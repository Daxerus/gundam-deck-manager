import { describe, expect, it } from 'vitest';
import { buildCardStatusBreakdown, computeStatusColor, groupLoanParties } from './cardStatus';

describe('computeStatusColor', () => {
  it('green when all own copies in box and no loans', () => {
    expect(computeStatusColor({ ownTotal: 4, ownInDecks: 0, hasLoans: false })).toBe('green');
  });

  it('yellow when any loan modifier', () => {
    expect(computeStatusColor({ ownTotal: 4, ownInDecks: 0, hasLoans: true })).toBe('yellow');
    expect(computeStatusColor({ ownTotal: 4, ownInDecks: 4, hasLoans: true })).toBe('yellow');
  });

  it('yellow when some but not all own copies in decks', () => {
    expect(computeStatusColor({ ownTotal: 4, ownInDecks: 2, hasLoans: false })).toBe('yellow');
  });

  it('red when all own copies in decks and no loans', () => {
    expect(computeStatusColor({ ownTotal: 3, ownInDecks: 3, hasLoans: false })).toBe('red');
  });
});

describe('buildCardStatusBreakdown', () => {
  it('sums displayQty as owned + lentOut and splits borrowed from box', () => {
    const status = buildCardStatusBreakdown({
      productId: 'P1',
      owned: 3,
      deckAlloc: [{ deckId: 1, name: 'Mazo 1', qty: 1 }],
      lentOut: [{ userId: 2, username: 'bob', qty: 1, loanId: 10 }],
      borrowedIn: [{ userId: 3, username: 'cara', qty: 1, loanId: 11 }],
    });
    expect(status.displayQty).toBe(4); // 3 owned + 1 lent
    expect(status.ownTotal).toBe(3); // 3-1 borrowed + 1 lent = 3
    expect(status.borrowedIn).toHaveLength(1);
    expect(status.lentOut).toHaveLength(1);
    expect(status.decks.reduce((s, d) => s + d.qty, 0) + status.box + 1).toBe(3); // own physical
    expect(status.statusColor).toBe('yellow');
  });

  it('marks red when all own copies sit in decks', () => {
    const status = buildCardStatusBreakdown({
      productId: 'P1',
      owned: 2,
      deckAlloc: [{ deckId: 1, name: 'Control', qty: 2 }],
      lentOut: [],
      borrowedIn: [],
    });
    expect(status.statusColor).toBe('red');
    expect(status.box).toBe(0);
    expect(status.displayQty).toBe(2);
  });
});

describe('groupLoanParties', () => {
  it('groups by user', () => {
    const grouped = groupLoanParties([
      { userId: 1, username: 'a', qty: 1, loanId: 1 },
      { userId: 1, username: 'a', qty: 2, loanId: 2 },
      { userId: 2, username: 'b', qty: 1, loanId: 3 },
    ]);
    expect(grouped).toEqual([
      { userId: 1, username: 'a', qty: 3, loanId: 1 },
      { userId: 2, username: 'b', qty: 1, loanId: 3 },
    ]);
  });
});
