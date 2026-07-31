import { describe, expect, it } from 'vitest';
import { buildFacetsFromCards } from './cardFacets';

describe('buildFacetsFromCards', () => {
  it('aggregates sets, traits, rarities, and source titles', () => {
    const facets = buildFacetsFromCards([
      {
        set_code: 'GD01',
        set_name: 'Newtype Rising',
        rarity: 'C',
        source_title: 'MSG',
        traits: ['(Earth Federation)', '(White Base Team)'],
      },
      {
        set_code: 'GD01',
        set_name: 'Promotion card',
        rarity: 'C',
        source_title: 'MSG',
        traits: '["(Earth Federation)"]',
      },
      {
        set_code: 'GD02',
        set_name: 'Seed Strike',
        rarity: 'R',
        source_title: 'SEED',
        traits: null,
      },
    ]);

    expect(facets.sets).toEqual([
      { setCode: 'GD01', setName: 'Newtype Rising', count: 2 },
      { setCode: 'GD02', setName: 'Seed Strike', count: 1 },
    ]);
    expect(facets.rarities).toEqual([
      { rarity: 'C', count: 2 },
      { rarity: 'R', count: 1 },
    ]);
    expect(facets.sourceTitles).toEqual([
      { sourceTitle: 'MSG', count: 2 },
      { sourceTitle: 'SEED', count: 1 },
    ]);
    expect(facets.traits).toEqual([
      { trait: '(Earth Federation)', count: 2 },
      { trait: '(White Base Team)', count: 1 },
    ]);
  });
});
