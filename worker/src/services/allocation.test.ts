import { describe, expect, it } from 'vitest';
import { computeActivationPlan, type DeckState } from './allocation';

const PRINTINGS = {
  C: ['C'],
  'C-normal': ['C-normal'],
  'C-alt': ['C-alt'],
  CN: ['C-normal', 'C-alt'],
};

function deck(partial: Partial<DeckState> & { deckId: number }): DeckState {
  return {
    name: `Deck ${partial.deckId}`,
    isActive: false,
    updatedAt: partial.deckId,
    required: {},
    alloc: {},
    ...partial,
  };
}

describe('computeActivationPlan', () => {
  it('(a) pulls a shared single copy from an active deck', () => {
    const plan = computeActivationPlan({
      targetId: 2,
      owned: { C: 1 },
      printingsByCardNumber: PRINTINGS,
      decks: [
        deck({ deckId: 1, isActive: true, required: { C: 1 }, alloc: { C: 1 } }),
        deck({ deckId: 2, required: { C: 1 } }),
      ],
    });
    expect(plan.complete).toBe(true);
    expect(plan.shortages).toHaveLength(0);
    expect(plan.moves).toEqual([{ productId: 'C', from: { deckId: 1, name: 'Deck 1' }, qty: 1 }]);
    expect(plan.targetAllocation).toEqual({ C: 1 });
  });

  it('(b) takes from the box when enough free copies exist (no conflict)', () => {
    const plan = computeActivationPlan({
      targetId: 2,
      owned: { C: 2 },
      printingsByCardNumber: PRINTINGS,
      decks: [
        deck({ deckId: 1, isActive: true, required: { C: 1 }, alloc: { C: 1 } }),
        deck({ deckId: 2, required: { C: 1 } }),
      ],
    });
    expect(plan.complete).toBe(true);
    expect(plan.affectedDecks).toHaveLength(0);
    expect(plan.moves).toEqual([{ productId: 'C', from: 'box', qty: 1 }]);
  });

  it('(c) reports a shortage for copies not owned (no phantom swaps)', () => {
    const plan = computeActivationPlan({
      targetId: 1,
      owned: {},
      printingsByCardNumber: PRINTINGS,
      decks: [deck({ deckId: 1, required: { C: 2 } })],
    });
    expect(plan.complete).toBe(false);
    expect(plan.moves).toHaveLength(0);
    expect(plan.shortages).toEqual([{ cardNumber: 'C', required: 2, owned: 0, missing: 2 }]);
    expect(plan.targetAllocation).toEqual({});
  });

  it('(d) is idempotent: an already-assembled deck needs no moves', () => {
    const plan = computeActivationPlan({
      targetId: 1,
      owned: { C: 1 },
      printingsByCardNumber: PRINTINGS,
      decks: [deck({ deckId: 1, isActive: true, required: { C: 1 }, alloc: { C: 1 } })],
    });
    expect(plan.complete).toBe(true);
    expect(plan.moves).toHaveLength(0);
  });

  it('(e) pulls from inactive decks before active ones', () => {
    const plan = computeActivationPlan({
      targetId: 3,
      owned: { C: 2 },
      printingsByCardNumber: PRINTINGS,
      decks: [
        deck({ deckId: 1, name: 'Active', isActive: true, updatedAt: 5, required: { C: 1 }, alloc: { C: 1 } }),
        deck({ deckId: 2, name: 'Inactive', isActive: false, updatedAt: 3, required: { C: 1 }, alloc: { C: 1 } }),
        deck({ deckId: 3, name: 'Target', required: { C: 2 } }),
      ],
    });
    expect(plan.complete).toBe(true);
    const deckMoves = plan.moves.filter((m) => m.from !== 'box');
    expect(deckMoves[0].from).toMatchObject({ deckId: 2 });
    expect(deckMoves[1].from).toMatchObject({ deckId: 1 });
    expect(plan.targetAllocation).toEqual({ C: 2 });
  });

  it('(f) mixes box + partial buy: owns 1 of a needed 2', () => {
    const plan = computeActivationPlan({
      targetId: 1,
      owned: { C: 1 },
      printingsByCardNumber: PRINTINGS,
      decks: [deck({ deckId: 1, required: { C: 2 } })],
    });
    expect(plan.moves).toEqual([{ productId: 'C', from: 'box', qty: 1 }]);
    expect(plan.shortages).toEqual([{ cardNumber: 'C', required: 2, owned: 1, missing: 1 }]);
    expect(plan.targetAllocation).toEqual({ C: 1 });
  });

  it('uses any owned printing to satisfy a card_number requirement', () => {
    const plan = computeActivationPlan({
      targetId: 1,
      owned: { C: 1, C_p1: 1 },
      printingsByCardNumber: { CN: ['C', 'C_p1'] },
      decks: [deck({ deckId: 1, required: { CN: 2 } })],
    });

    expect(plan.complete).toBe(true);
    expect(plan.moves).toEqual([
      { productId: 'C', from: 'box', qty: 1 },
      { productId: 'C_p1', from: 'box', qty: 1 },
    ]);
    expect(plan.targetAllocation).toEqual({ C: 1, C_p1: 1 });
  });

  it('exposes alternative sources and honors the selected deck + printing', () => {
    const input = {
      targetId: 3,
      owned: { C: 4 },
      printingsByCardNumber: PRINTINGS,
      decks: [
        deck({ deckId: 1, isActive: true, alloc: { C: 1 } }),
        deck({ deckId: 2, isActive: true, alloc: { C: 1 } }),
        deck({ deckId: 3, name: 'Target', required: { C: 3 } }),
      ],
    };

    const preview = computeActivationPlan(input);
    expect(preview.pullOptions).toEqual([
      {
        cardNumber: 'C',
        qty: 1,
        holders: [
          { deckId: 1, name: 'Deck 1', productId: 'C', qty: 1, isActive: true },
          { deckId: 2, name: 'Deck 2', productId: 'C', qty: 1, isActive: true },
        ],
      },
    ]);

    const selected = computeActivationPlan(input, {
      preferences: [{ cardNumber: 'C', pulls: [{ deckId: 2, productId: 'C', qty: 1 }] }],
    });
    expect(selected.moves).toEqual([
      { productId: 'C', from: 'box', qty: 2 },
      { productId: 'C', from: { deckId: 2, name: 'Deck 2' }, qty: 1 },
    ]);
  });

  it('skips the box when allowBox is false and pulls from decks instead', () => {
    const plan = computeActivationPlan(
      {
        targetId: 2,
        owned: { C: 2 },
        printingsByCardNumber: PRINTINGS,
        decks: [
          deck({ deckId: 1, isActive: true, required: { C: 1 }, alloc: { C: 1 } }),
          deck({ deckId: 2, required: { C: 1 } }),
        ],
      },
      { allowBox: false },
    );
    expect(plan.allowBox).toBe(false);
    expect(plan.complete).toBe(true);
    expect(plan.moves).toEqual([{ productId: 'C', from: { deckId: 1, name: 'Deck 1' }, qty: 1 }]);
  });

  it('reports shortage when allowBox is false and copies exist only in the box', () => {
    const plan = computeActivationPlan(
      {
        targetId: 1,
        owned: { C: 2 },
        printingsByCardNumber: PRINTINGS,
        decks: [deck({ deckId: 1, required: { C: 2 } })],
      },
      { allowBox: false },
    );
    expect(plan.complete).toBe(false);
    expect(plan.moves).toHaveLength(0);
    expect(plan.shortages).toEqual([{ cardNumber: 'C', required: 2, owned: 2, missing: 2 }]);
  });

  it('covers a card_number with mixed normal + alter printings', () => {
    const plan = computeActivationPlan({
      targetId: 2,
      owned: { 'ST01-001': 3, 'ST01-001_p8': 2 },
      printingsByCardNumber: { 'ST01-001': ['ST01-001', 'ST01-001_p8'] },
      decks: [
        deck({
          deckId: 1,
          isActive: true,
          required: { 'ST01-001': 4 },
          alloc: { 'ST01-001': 3, 'ST01-001_p8': 1 },
        }),
        deck({ deckId: 2, required: { 'ST01-001': 4 } }),
      ],
    });
    expect(plan.complete).toBe(true);
    expect(plan.shortages).toHaveLength(0);
    expect(plan.moves).toEqual([
      { productId: 'ST01-001_p8', from: 'box', qty: 1 },
      { productId: 'ST01-001', from: { deckId: 1, name: 'Deck 1' }, qty: 3 },
    ]);
    expect(plan.targetAllocation).toEqual({ 'ST01-001': 3, 'ST01-001_p8': 1 });
    expect(plan.affectedDecks).toEqual([
      {
        deckId: 1,
        name: 'Deck 1',
        wasActive: true,
        pulled: [{ productId: 'ST01-001', qty: 3 }],
      },
    ]);
  });

  it('keeps already-valid allocations when reactivating the same deck', () => {
    const plan = computeActivationPlan({
      targetId: 1,
      owned: { 'ST01-001': 2, 'ST01-001_p8': 2 },
      printingsByCardNumber: { 'ST01-001': ['ST01-001', 'ST01-001_p8'] },
      decks: [
        deck({
          deckId: 1,
          isActive: true,
          required: { 'ST01-001': 4 },
          alloc: { 'ST01-001': 2, 'ST01-001_p8': 2 },
        }),
      ],
    });
    expect(plan.complete).toBe(true);
    expect(plan.moves).toHaveLength(0);
    expect(plan.targetAllocation).toEqual({ 'ST01-001': 2, 'ST01-001_p8': 2 });
  });

  it('can swap printings across decks while satisfying aggregated demand', () => {
    const plan = computeActivationPlan({
      targetId: 2,
      owned: { 'C-normal': 2, 'C-alt': 2 },
      printingsByCardNumber: { CN: ['C-normal', 'C-alt'] },
      decks: [
        deck({
          deckId: 1,
          isActive: true,
          required: { CN: 2 },
          alloc: { 'C-alt': 2 },
        }),
        deck({ deckId: 2, required: { CN: 2 } }),
      ],
    });
    expect(plan.complete).toBe(true);
    expect(plan.moves).toEqual([
      { productId: 'C-normal', from: 'box', qty: 2 },
    ]);
    expect(plan.targetAllocation).toEqual({ 'C-normal': 2 });
    expect(plan.affectedDecks).toHaveLength(0);
  });

  it('reports aggregated shortage across printings of one card_number', () => {
    const plan = computeActivationPlan({
      targetId: 1,
      owned: { 'C-normal': 1, 'C-alt': 1 },
      printingsByCardNumber: { CN: ['C-normal', 'C-alt'] },
      decks: [deck({ deckId: 1, required: { CN: 4 } })],
    });
    expect(plan.complete).toBe(false);
    expect(plan.moves).toEqual([
      { productId: 'C-alt', from: 'box', qty: 1 },
      { productId: 'C-normal', from: 'box', qty: 1 },
    ]);
    expect(plan.shortages).toEqual([{ cardNumber: 'CN', required: 4, owned: 2, missing: 2 }]);
    expect(plan.targetAllocation).toEqual({ 'C-alt': 1, 'C-normal': 1 });
  });
});
