import { describe, expect, it } from 'vitest';
import { selectLendPrintings, type PrintingAvailability } from './loans';

const printing = (
  productId: string,
  free: number,
  inDecks = 0,
): PrintingAvailability => ({ productId, free, inDecks });

describe('selectLendPrintings', () => {
  it('uses the requested printing when it has free copies', () => {
    const picked = selectLendPrintings('GD01-086', 2, [
      printing('GD01-086', 3),
      printing('GD01-086_p3', 2),
    ]);
    expect(picked).toEqual([{ productId: 'GD01-086', quantity: 2 }]);
  });

  it('falls back to another printing of the same card', () => {
    const picked = selectLendPrintings('GD01-086_p3', 2, [
      printing('GD01-086', 2),
      printing('GD01-086_p3', 0),
    ]);
    expect(picked).toEqual([{ productId: 'GD01-086', quantity: 2 }]);
  });

  it('spreads across printings when no single one is enough', () => {
    const picked = selectLendPrintings('GD01-086', 3, [
      printing('GD01-086', 1),
      printing('GD01-086_p1', 1),
      printing('GD01-086_p3', 1),
    ]);
    expect(picked).toEqual([
      { productId: 'GD01-086', quantity: 1 },
      { productId: 'GD01-086_p1', quantity: 1 },
      { productId: 'GD01-086_p3', quantity: 1 },
    ]);
  });

  it('prefers box copies over copies held by a deck', () => {
    const picked = selectLendPrintings('GD01-086', 1, [
      printing('GD01-086', 0, 2),
      printing('GD01-086_p3', 1),
    ]);
    expect(picked).toEqual([{ productId: 'GD01-086_p3', quantity: 1 }]);
  });

  it('takes copies out of a deck only as a last resort', () => {
    const picked = selectLendPrintings('GD01-086', 2, [
      printing('GD01-086', 0, 2),
      printing('GD01-086_p3', 1),
    ]);
    expect(picked).toEqual([
      { productId: 'GD01-086_p3', quantity: 1 },
      { productId: 'GD01-086', quantity: 1 },
    ]);
  });

  it('returns null when the lender owns no copies of any printing', () => {
    expect(
      selectLendPrintings('GD01-086_p3', 1, [printing('GD01-086', 0), printing('GD01-086_p3', 0)]),
    ).toBeNull();
  });

  it('returns null when short even after counting deck copies', () => {
    expect(selectLendPrintings('GD01-086', 4, [printing('GD01-086', 1, 2)])).toBeNull();
  });
});
