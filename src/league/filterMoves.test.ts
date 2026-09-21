import { describe, expect, it } from 'vitest';
import { filterMoves } from './filterMoves';

/**
 * Same rule as `useFilteredPokemon`: a typed query is a lookup, not a
 * refinement of the chips. The Fire gym pre-selects Fire, and that must not
 * hide Surf when the user types "surf".
 */
describe('filterMoves', () => {
  it('ignores type, category, and contest chips while a query is present', () => {
    const rows = filterMoves({
      search: 'surf',
      types: ['fire'],
      categories: ['physical'],
      contests: ['tough'],
    });
    expect(rows.map((m) => m.name)).toContain('Surf');
    expect(rows.every((m) => m.name.toLowerCase().includes('surf'))).toBe(true);
  });

  it('still applies chips when the query is empty', () => {
    const rows = filterMoves({
      search: '',
      types: ['fire'],
      categories: ['physical'],
      contests: [],
    });
    expect(rows.map((m) => m.name)).not.toContain('Surf');
    expect(rows.every((m) => m.type === 'fire' && m.category === 'physical')).toBe(true);
  });

  it('treats a whitespace-only query as no query', () => {
    const rows = filterMoves({
      search: '   ',
      types: ['fire'],
      categories: [],
      contests: [],
    });
    expect(rows.every((m) => m.type === 'fire')).toBe(true);
    expect(rows.map((m) => m.name)).not.toContain('Surf');
  });
});
