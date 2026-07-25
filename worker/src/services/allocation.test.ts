import { describe, expect, it } from 'vitest';
import { computeActivationPlan, type DeckState } from './allocation';

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
      decks: [
        deck({ deckId: 1, isActive: true, required: { C: 1 }, alloc: { C: 1 } }),
        deck({ deckId: 2, required: { C: 1 } }),
      ],
    });
    expect(plan.complete).toBe(true);
    expect(plan.shortages).toHaveLength(0);
    expect(plan.moves).toEqual([{ productId: 'C', from: { deckId: 1, name: 'Deck 1' }, qty: 1 }]);
    expect(plan.affectedDecks).toHaveLength(1);
    expect(plan.affectedDecks[0]).toMatchObject({ deckId: 1, wasActive: true });
    expect(plan.targetAllocation).toEqual({ C: 1 });
  });

  it('(b) takes from the box when enough free copies exist (no conflict)', () => {
    const plan = computeActivationPlan({
      targetId: 2,
      owned: { C: 2 },
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
      decks: [deck({ deckId: 1, required: { C: 2 } })],
    });
    expect(plan.complete).toBe(false);
    expect(plan.moves).toHaveLength(0);
    expect(plan.affectedDecks).toHaveLength(0);
    expect(plan.shortages).toEqual([{ productId: 'C', required: 2, owned: 0, missing: 2 }]);
    expect(plan.targetAllocation).toEqual({ C: 0 });
  });

  it('(d) is idempotent: an already-assembled deck needs no moves', () => {
    const plan = computeActivationPlan({
      targetId: 1,
      owned: { C: 1 },
      decks: [deck({ deckId: 1, isActive: true, required: { C: 1 }, alloc: { C: 1 } })],
    });
    expect(plan.complete).toBe(true);
    expect(plan.moves).toHaveLength(0);
    expect(plan.affectedDecks).toHaveLength(0);
  });

  it('(e) pulls from inactive decks before active ones', () => {
    const plan = computeActivationPlan({
      targetId: 3,
      owned: { C: 2 },
      decks: [
        deck({ deckId: 1, name: 'Active', isActive: true, updatedAt: 5, required: { C: 1 }, alloc: { C: 1 } }),
        deck({ deckId: 2, name: 'Inactive', isActive: false, updatedAt: 3, required: { C: 1 }, alloc: { C: 1 } }),
        deck({ deckId: 3, name: 'Target', required: { C: 2 } }),
      ],
    });
    expect(plan.complete).toBe(true);
    // First pull should come from the inactive deck (deckId 2).
    const deckMoves = plan.moves.filter((m) => m.from !== 'box');
    expect(deckMoves[0].from).toMatchObject({ deckId: 2 });
    expect(deckMoves[1].from).toMatchObject({ deckId: 1 });
    expect(plan.targetAllocation).toEqual({ C: 2 });
  });

  it('(f) mixes box + partial buy: owns 1 of a needed 2', () => {
    const plan = computeActivationPlan({
      targetId: 1,
      owned: { C: 1 },
      decks: [deck({ deckId: 1, required: { C: 2 } })],
    });
    expect(plan.moves).toEqual([{ productId: 'C', from: 'box', qty: 1 }]);
    expect(plan.shortages).toEqual([{ productId: 'C', required: 2, owned: 1, missing: 1 }]);
    expect(plan.complete).toBe(false);
    expect(plan.targetAllocation).toEqual({ C: 1 });
  });

  it('tracks alternate printings independently', () => {
    const plan = computeActivationPlan({
      targetId: 1,
      owned: { 'C-normal': 2, 'C-alt': 1 },
      decks: [deck({ deckId: 1, required: { 'C-normal': 2, 'C-alt': 1 } })],
    });

    expect(plan.complete).toBe(true);
    expect(plan.moves).toEqual([
      { productId: 'C-normal', from: 'box', qty: 2 },
      { productId: 'C-alt', from: 'box', qty: 1 },
    ]);
    expect(plan.targetAllocation).toEqual({ 'C-normal': 2, 'C-alt': 1 });
  });

  it('exposes alternative sources and honors the selected deck', () => {
    const input = {
      targetId: 3,
      owned: { C: 4 },
      decks: [
        deck({ deckId: 1, isActive: true, alloc: { C: 1 } }),
        deck({ deckId: 2, isActive: true, alloc: { C: 1 } }),
        deck({ deckId: 3, name: 'Target', required: { C: 3 } }),
      ],
    };

    const preview = computeActivationPlan(input);
    expect(preview.pullOptions).toEqual([
      {
        productId: 'C',
        qty: 1,
        holders: [
          { deckId: 1, name: 'Deck 1', qty: 1, isActive: true },
          { deckId: 2, name: 'Deck 2', qty: 1, isActive: true },
        ],
      },
    ]);

    const selected = computeActivationPlan(input, {
      preferences: [{ productId: 'C', pulls: [{ deckId: 2, qty: 1 }] }],
    });
    expect(selected.moves).toEqual([
      { productId: 'C', from: 'box', qty: 2 },
      { productId: 'C', from: { deckId: 2, name: 'Deck 2' }, qty: 1 },
    ]);
    expect(selected.affectedDecks.map((affected) => affected.deckId)).toEqual([2]);
  });

  it('allows all required copies to come from one of several capable decks', () => {
    const plan = computeActivationPlan(
      {
        targetId: 3,
        owned: { C: 4 },
        decks: [
          deck({ deckId: 1, isActive: true, alloc: { C: 2 } }),
          deck({ deckId: 2, isActive: true, alloc: { C: 2 } }),
          deck({ deckId: 3, required: { C: 2 } }),
        ],
      },
      { preferences: [{ productId: 'C', pulls: [{ deckId: 2, qty: 2 }] }] },
    );

    expect(plan.moves).toEqual([
      { productId: 'C', from: { deckId: 2, name: 'Deck 2' }, qty: 2 },
    ]);
    expect(plan.affectedDecks.map((affected) => affected.deckId)).toEqual([2]);
  });

  it('rejects a source selection that exceeds the deck allocation', () => {
    expect(() =>
      computeActivationPlan(
        {
          targetId: 3,
          owned: { C: 2 },
          decks: [
            deck({ deckId: 1, alloc: { C: 1 } }),
            deck({ deckId: 2, alloc: { C: 1 } }),
            deck({ deckId: 3, required: { C: 1 } }),
          ],
        },
        { preferences: [{ productId: 'C', pulls: [{ deckId: 1, qty: 2 }] }] },
      ),
    ).toThrow('exceeds available copies');
  });

  it('skips the box when allowBox is false and pulls from decks instead', () => {
    const plan = computeActivationPlan(
      {
        targetId: 2,
        owned: { C: 2 },
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
    expect(plan.affectedDecks).toHaveLength(1);
  });

  it('reports shortage when allowBox is false and copies exist only in the box', () => {
    const plan = computeActivationPlan(
      {
        targetId: 1,
        owned: { C: 2 },
        decks: [deck({ deckId: 1, required: { C: 2 } })],
      },
      { allowBox: false },
    );
    expect(plan.complete).toBe(false);
    expect(plan.moves).toHaveLength(0);
    expect(plan.shortages).toEqual([{ productId: 'C', required: 2, owned: 2, missing: 2 }]);
  });
});
