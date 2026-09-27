import { describe, expect, it } from 'vitest';
import { migrateFavoriteFills, useFavoritesStore } from './useFavoritesStore';
import type { GenAxisId, TypeAxisId } from '../model/cells';

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

describe('placing a pick with the no-repeat setting', () => {
  // Catches a kick that misses a linked legendary or gimmick cell, clears a
  // pick outside the placed cell's row and column, or leaves a dead pointer.
  function placeInto(saved: Record<string, number>, cell: string, id: number, noRepeats: boolean) {
    const [type, gen] = cell.split('|');
    useFavoritesStore.setState({ fills: saved });
    useFavoritesStore.getState().place(
      type as TypeAxisId,
      (/^\d+$/.test(gen) ? Number(gen) : gen) as GenAxisId,
      id,
      noRepeats,
    );
    return useFavoritesStore.getState().fills;
  }

  it.each([
    ['another type in the generation', { 'grass|1': 1 }, 'poison|1', 1, { 'poison|1': 1 }],
    ['the starter cell of the generation', { 'grass|1': 1 }, 'starter|1', 1, { 'starter|1': 1 }],
    ['the legendary cell of the generation', { 'legendary|2': 249 }, 'psychic|2', 249, { 'psychic|2': 249 }],
    ['the type column', { 'fire|2': 250 }, 'fire|legendary', 250, { 'fire|legendary': 250 }],
    ['the legendary column, from the legendary row', { 'legendary|2': 249 }, 'psychic|legendary', 249, { 'psychic|legendary': 249 }],
    ['the legendary row, from the legendary column', { 'flying|legendary': 249 }, 'legendary|2', 249, { 'legendary|2': 249 }],
    ['the gimmick column, from the gimmick row', { 'gimmick|1': 10039 }, 'normal|gimmick', 10039, { 'normal|gimmick': 10039 }],
    ['the gimmick row, from the legendary gimmick cell', { 'gimmick|7': 10157 }, 'legendary|gimmick', 10157, { 'legendary|gimmick': 10157 }],
    ['the legendary column, from the legendary gimmick cell', { 'legendary|7': 10157 }, 'legendary|gimmick', 10157, { 'legendary|gimmick': 10157 }],
  ])('moves a pick out of %s', (_, saved, cell, id, moved) => {
    expect(placeInto(saved, cell, id, true)).toEqual(moved);
    expect(placeInto(saved, cell, id, false)).toEqual({ ...saved, ...moved });
  });

  it.each([
    ['a regional form in another type column', { 'dark|8': 10174 }, 'normal|gimmick', 10174],
    ['a legendary row pick seen from a generation cell', { 'flying|legendary': 249 }, 'psychic|2', 249],
    ['a source pick when the placed cell is a pointer', { 'fire|1': 6 }, 'fire|favorite', 6],
  ])('keeps %s', (_, saved, cell, id) => {
    const key = Object.keys(saved)[0];
    expect(placeInto(saved, cell, id, true)[key]).toBe(id);
  });

  it('keeps a pointer that still has a source and drops one that lost it', () => {
    expect(placeInto({ 'fire|1': 4, 'favorite|1': 4 }, 'starter|1', 4, true)).toEqual({ 'starter|1': 4, 'favorite|1': 4 });
    expect(placeInto({ 'legendary|2': 249, 'favorite|2': 249 }, 'psychic|legendary', 249, true)).toEqual({ 'psychic|legendary': 249 });
  });
});
