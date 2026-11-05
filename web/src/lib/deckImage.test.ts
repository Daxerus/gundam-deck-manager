import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  deckImageFileSlug,
  pickCoverCard,
  prepareDeckImage,
  type DeckImageCard,
  type DeckImageOptions,
} from './deckImageModel.ts';

const options: DeckImageOptions = {
  layout: 'poster',
  order: 'cost',
  format: 'png',
  size: 'standard',
  showCreator: true,
  showName: true,
  showCover: true,
  showQr: true,
  coverCardNumber: null,
};

function card(partial: Partial<DeckImageCard> & Pick<DeckImageCard, 'cardNumber'>): DeckImageCard {
  return {
    name: partial.cardNumber,
    quantity: 1,
    cardType: 'UNIT',
    color: 'Blue',
    level: 1,
    cost: 1,
    imageUrl: null,
    ...partial,
  };
}

test('orders by type, then cost, and sends missing costs to the end', () => {
  const prepared = prepareDeckImage(
    [
      card({ cardNumber: 'GD01-010', cardType: 'PILOT', cost: 1 }),
      card({ cardNumber: 'GD01-002', cardType: 'UNIT', cost: 4 }),
      card({ cardNumber: 'GD01-001', cardType: 'UNIT', cost: null }),
      card({ cardNumber: 'GD01-003', cardType: 'UNIT', cost: 1, quantity: 4 }),
      card({ cardNumber: 'ST01-015', cardType: 'BASE', cost: 2 }),
    ],
    options,
  );
  assert.deepEqual(
    prepared.ordered.map((entry) => entry.cardNumber),
    ['GD01-003', 'GD01-002', 'GD01-001', 'GD01-010', 'ST01-015'],
  );
});

test('poster keeps one cell per card and grid expands copies', () => {
  const cards = [
    card({ cardNumber: 'GD01-001', quantity: 4, cost: 2 }),
    card({ cardNumber: 'GD01-002', quantity: 2, cost: 3 }),
  ];
  const poster = prepareDeckImage(cards, options);
  const grid = prepareDeckImage(cards, { ...options, layout: 'grid' });
  assert.equal(poster.cells.length, 2);
  assert.equal(grid.cells.length, 6);
  assert.equal(grid.sheet.columns, 10);
  assert.equal(grid.sheet.showCount, false);
  assert.equal(poster.sheet.showCount, true);
  assert.ok(grid.sheet.height < poster.sheet.height);
});

test('counts copies in type, color, and curve stats', () => {
  const prepared = prepareDeckImage(
    [
      card({ cardNumber: 'U1', cardType: 'UNIT', color: 'blue', cost: 1, level: 3, quantity: 4 }),
      card({ cardNumber: 'U2', cardType: 'UNIT', color: 'White', cost: 2, level: 4, quantity: 2 }),
      card({ cardNumber: 'P1', cardType: 'PILOT', color: 'Blue', cost: 1, level: 4, quantity: 3 }),
    ],
    options,
  );
  assert.deepEqual(prepared.types, [
    { label: 'UNITS', count: 6 },
    { label: 'PILOTS', count: 3 },
  ]);
  assert.deepEqual(
    prepared.colors.map((color) => [color.color, color.count]),
    [
      ['Blue', 7],
      ['White', 2],
    ],
  );
  const cost = prepared.curves[0]!;
  assert.equal(cost.label, 'COST');
  assert.equal(cost.average?.toFixed(1), '1.2');
  assert.equal(cost.buckets[1]?.count, 7);
  assert.equal(cost.buckets[2]?.count, 2);
  const level = prepared.curves[1]!;
  assert.equal(level.label, 'LEVEL');
  assert.equal(level.average?.toFixed(1), '3.6');
});

test('sheet grows when another row of cards is added', () => {
  const few = prepareDeckImage(
    Array.from({ length: 5 }, (_, index) => card({ cardNumber: `GD01-00${index}`, cost: index })),
    options,
  );
  const more = prepareDeckImage(
    Array.from({ length: 6 }, (_, index) => card({ cardNumber: `GD01-00${index}`, cost: index })),
    options,
  );
  assert.ok(more.sheet.height > few.sheet.height);
  assert.equal(few.sheet.cardsTop, 500);
});

test('uses the chosen card as the banner, and falls back to the first unit', () => {
  const cards = [
    card({ cardNumber: 'P1', cardType: 'PILOT', imageUrl: 'https://example.test/p.png' }),
    card({ cardNumber: 'U1', cardType: 'UNIT', imageUrl: 'https://example.test/u.png', cost: 2 }),
    card({ cardNumber: 'U2', cardType: 'UNIT', imageUrl: 'https://example.test/u2.png', cost: 5 }),
  ];
  assert.equal(pickCoverCard(cards, null)?.cardNumber, 'U1');
  assert.equal(pickCoverCard(cards, 'U2')?.cardNumber, 'U2');
  assert.equal(pickCoverCard(cards, 'missing')?.cardNumber, 'U1');
  assert.equal(prepareDeckImage(cards, { ...options, coverCardNumber: 'P1' }).cover?.cardNumber, 'P1');
});

test('builds a file slug from the deck name', () => {
  assert.equal(deckImageFileSlug('Blue White Control'), 'blue-white-control');
  assert.equal(deckImageFileSlug('   '), 'deck');
});
