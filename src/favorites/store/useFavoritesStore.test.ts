import { describe, expect, it } from 'vitest';
import { migrateFavoriteFills } from './useFavoritesStore';

describe('favorite picker saved-form migration', () => {
  it('moves an LGPE starter pick to the regular Gen 1 species if the cell is empty', () => {
    expect(migrateFavoriteFills({ 'starter|7': 10158, 'fire|1': 4 })).toEqual({
      'starter|1': 25,
      'fire|1': 4,
    });
  });

  it('preserves an existing Gen 1 starter and removes retired Gen 7 forms', () => {
    expect(migrateFavoriteFills({ 'starter|1': 1, 'starter|7': 10159, 'normal|7': 10159 })).toEqual({
      'starter|1': 1,
    });
  });
});
