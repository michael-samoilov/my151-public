import { describe, expect, it } from 'vitest';
import { movesForPicker } from './filterMoves';

describe('movesForPicker', () => {
  it('chips still hide Surf when Fire and physical are on', () => {
    const rows = movesForPicker('', {
      types: ['fire'],
      categories: ['physical'],
      contests: [],
    });
    expect(rows.map((m) => m.name)).not.toContain('Surf');
    expect(rows.every((m) => m.type === 'fire' && m.category === 'physical')).toBe(true);
  });
});
