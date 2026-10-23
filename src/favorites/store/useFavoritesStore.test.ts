import { describe, expect, it } from 'vitest';
import { migrateFavoriteFills } from './useFavoritesStore';

describe('favorite picker saved-form migration', () => {
  it('moves an existing Gimmick favorite to the new overall Gimmick pointer', () => {
    expect(migrateFavoriteFills({ 'gimmick|1': 6, 'gimmick|favorite': 6 })).toEqual({
      'gimmick|1': 6,
      'gimmick|gimmick': 6,
    });
    expect(migrateFavoriteFills({ 'gimmick|favorite': 6 })).toEqual({});
  });

  it('moves a saved legendary gimmick out of the retired duplicate cell', () => {
    expect(migrateFavoriteFills({ 'gimmick|legendary': 10157 })).toEqual({
      'legendary|gimmick': 10157,
    });
  });
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

  it('moves retyped Terastal Ogerpon to its mask form when that fits, and clears what no longer fits', () => {
    expect(migrateFavoriteFills({
      'grass|9': 11116, 'grass|favorite': 11116, 'grass|gimmick': 11115, 'ghost|9': 11112, 'ghost|favorite': 11112,
      'rock|9': 11116, 'normal|9': 11112,
    })).toEqual({ 'grass|9': 10275, 'grass|favorite': 10275, 'rock|9': 11116, 'normal|9': 11112 });
  });

  it('keeps previously filled type, category, and favorite cells during a version migration', () => {
    const saved = {
      'fire|1': 6,
      'water|4': 423,
      'starter|8': 813,
      'legendary|3': 384,
      'fire|favorite': 6,
      'favorite|1': 6,
    };
    expect(migrateFavoriteFills(saved)).toEqual(saved);
  });
});
