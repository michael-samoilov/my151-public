import { beforeEach, describe, expect, it, vi } from 'vitest';

const saved = vi.hoisted(() => {
  const items = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
  Object.assign(globalThis, { window: { localStorage } });
  return items;
});

import { migrateFavoriteFills, useFavoritesStore } from './useFavoritesStore';

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

describe('favorite picker saves from before shiny picks', () => {
  beforeEach(() => useFavoritesStore.setState(useFavoritesStore.getInitialState(), true));

  async function load(save: object) {
    saved.set('favorite-picker', JSON.stringify(save));
    await useFavoritesStore.persist.rehydrate();
    return useFavoritesStore;
  }

  it('loads a current save with its picks and no shiny picks, so a tap cannot read a missing map', async () => {
    const store = await load({ state: { fills: { 'fire|1': 6, 'favorite|1': 6 } }, version: 4 });
    expect(store.getState().fills).toEqual({ 'fire|1': 6, 'favorite|1': 6 });
    expect(store.getState().shiny).toEqual({});
    store.getState().place('water', 1, 131, true);
    expect(store.getState().shiny).toEqual({ 'water|1': 131 });
  });

  it('migrates an older save and still starts with no shiny picks', async () => {
    const store = await load({ state: { fills: { 'gimmick|favorite': 6, 'gimmick|1': 6 } }, version: 3 });
    expect(store.getState().fills).toEqual({ 'gimmick|1': 6, 'gimmick|gimmick': 6 });
    expect(store.getState().shiny).toEqual({});
  });

  it('keeps shiny picks across a reload, and drops one whose cell gets another Pokémon', async () => {
    const store = await load({ state: { fills: { 'fire|1': 6, 'grass|1': 3 }, shiny: { 'fire|1': 6, 'grass|1': 3 } }, version: 4 });
    expect(store.getState().shiny).toEqual({ 'fire|1': 6, 'grass|1': 3 });
    store.getState().place('fire', 1, 4);
    expect(JSON.parse(saved.get('favorite-picker')!).state.shiny).toEqual({ 'grass|1': 3 });
  });
});
