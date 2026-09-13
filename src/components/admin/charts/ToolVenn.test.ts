import { describe, expect, it } from 'vitest';
import { venn } from 'venn.js';
import { areasFromRegions } from './vennAreas';

const catalog = [
  { id: 'dex', label: 'Dex builder', short: 'Dex', launchedAt: 0 },
  { id: 'league', label: 'Gym leader maker', short: 'League', launchedAt: 1 },
];

describe('areasFromRegions', () => {
  it('turns exclusive regions into inclusive set sizes plus pairwise overlap', () => {
    expect(areasFromRegions({ dex: 10, league: 1, 'dex+league': 3 }, catalog)).toEqual([
      { sets: ['Dex'], size: 13 },
      { sets: ['League'], size: 4 },
      { sets: ['Dex', 'League'], size: 3 },
    ]);
  });

  it('drops a tool that has no members in this era', () => {
    expect(areasFromRegions({ dex: 20 }, catalog)).toEqual([{ sets: ['Dex'], size: 20 }]);
  });
});

describe('venn.js layout', () => {
  it('gives the larger set a larger radius', () => {
    const circles = venn([
      { sets: ['Dex'], size: 336 },
      { sets: ['League'], size: 3 },
      { sets: ['Dex', 'League'], size: 3 },
    ]);
    expect(circles.Dex.radius).toBeGreaterThan(circles.League.radius * 3);
  });
});
