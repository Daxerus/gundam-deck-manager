import { describe, expect, it } from 'vitest';

/**
 * Ownership filter contract used by routes/services.
 * Pure documentation of the isolation rule (user A never sees user B data).
 */
function filterByUserId<T extends { userId: number }>(rows: T[], userId: number): T[] {
  return rows.filter((r) => r.userId === userId);
}

describe('multi-user data isolation contract', () => {
  it('keeps decks and collection scoped to the requesting user', () => {
    const decks = [
      { id: 1, userId: 1, name: 'Alex Red' },
      { id: 2, userId: 2, name: 'Friend Blue' },
      { id: 3, userId: 1, name: 'Alex Green' },
    ];
    const collection = [
      { userId: 1, productId: 'GD01-001', quantity: 4 },
      { userId: 2, productId: 'GD01-001', quantity: 1 },
      { userId: 2, productId: 'GD01-002', quantity: 2 },
    ];

    expect(filterByUserId(decks, 1).map((d) => d.id)).toEqual([1, 3]);
    expect(filterByUserId(decks, 2).map((d) => d.id)).toEqual([2]);
    expect(filterByUserId(collection, 1)).toEqual([
      { userId: 1, productId: 'GD01-001', quantity: 4 },
    ]);
    expect(filterByUserId(collection, 2)).toHaveLength(2);
  });

  it('treats foreign deck ids as not found (no IDOR leak)', () => {
    const decks = [
      { id: 10, userId: 1 },
      { id: 11, userId: 2 },
    ];
    const getOwnedDeck = (userId: number, deckId: number) =>
      decks.find((d) => d.id === deckId && d.userId === userId) ?? null;

    expect(getOwnedDeck(1, 10)).not.toBeNull();
    expect(getOwnedDeck(1, 11)).toBeNull();
    expect(getOwnedDeck(2, 10)).toBeNull();
  });
});
