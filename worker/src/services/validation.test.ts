import { describe, expect, it } from 'vitest';
import { validateDeck, type CardMeta, type DeckCardInput } from './validation';

const meta = new Map<string, CardMeta>([
  ['A', { cardNumber: 'A', color: 'Blue', cardType: 'UNIT', name: 'Alpha' }],
  ['B', { cardNumber: 'B', color: 'Blue', cardType: 'UNIT', name: 'Bravo' }],
  ['C', { cardNumber: 'C', color: 'Red', cardType: 'PILOT', name: 'Charlie' }],
  ['D', { cardNumber: 'D', color: 'Green', cardType: 'COMMAND', name: 'Delta' }],
]);

/** Build a deck list totalling `total` cards using distinct card numbers (in blocks of <=4). */
function fill(total: number): DeckCardInput[] {
  const out: DeckCardInput[] = [];
  let i = 0;
  while (total > 0) {
    const q = Math.min(4, total);
    const cardNumber = `X${i}`;
    out.push({ cardNumber, quantity: q });
    meta.set(cardNumber, {
      cardNumber,
      color: 'Blue',
      cardType: 'UNIT',
      name: `Filler ${i}`,
    });
    total -= q;
    i++;
  }
  return out;
}

const noOwn = new Map<string, number>();

describe('validateDeck', () => {
  it('accepts a legal 50-card deck', () => {
    const r = validateDeck(fill(50), 10, meta, noOwn);
    expect(r.mainCount).toBe(50);
    expect(r.legal).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('rejects 49 and 51 card decks', () => {
    expect(validateDeck(fill(49), 10, meta, noOwn).legal).toBe(false);
    expect(validateDeck(fill(51), 10, meta, noOwn).legal).toBe(false);
  });

  it('rejects more than 4 copies of a card_number', () => {
    const deck50 = [...fill(45), { cardNumber: 'A', quantity: 5 }];
    const r = validateDeck(deck50, 10, meta, noOwn);
    expect(r.legal).toBe(false);
    expect(r.errors.some((e) => e.toLowerCase().includes('copias'))).toBe(true);
  });

  it('rejects more than 2 colors', () => {
    const deck = [
      ...fill(44),
      { cardNumber: 'C', quantity: 3 },
      { cardNumber: 'D', quantity: 3 },
    ];
    const r = validateDeck(deck, 10, meta, noOwn);
    expect(r.colors.length).toBe(3);
    expect(r.legal).toBe(false);
    expect(r.errors.some((e) => e.toLowerCase().includes('colores'))).toBe(true);
  });

  it('rejects a resource deck that is not 10 cards', () => {
    const r = validateDeck(fill(50), 8, meta, noOwn);
    expect(r.legal).toBe(false);
    expect(r.errors.some((e) => e.toLowerCase().includes('resource'))).toBe(true);
  });

  it('warns and lists shortages when copies are not owned', () => {
    const deck = [...fill(46), { cardNumber: 'A', quantity: 4 }];
    const owned = new Map([['A', 1]]);
    const r = validateDeck(deck, 10, meta, owned);
    expect(r.shortages).toContainEqual({
      cardNumber: 'A',
      name: 'Alpha',
      required: 4,
      owned: 1,
      missing: 3,
    });
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
