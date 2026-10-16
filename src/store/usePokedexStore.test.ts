import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const saved = new Map<string, string>();
let usePokedexStore: typeof import('./usePokedexStore')['usePokedexStore'];
const storageKey = 'personal-151-pokedex-v3';

beforeAll(async () => {
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage, location: { search: '' } });
  ({ usePokedexStore } = await import('./usePokedexStore'));
});

afterAll(() => vi.unstubAllGlobals());

describe('Dex reorder persistence', () => {
  it.each([
    { failure: 'replaces a saved member with a duplicate', current: [25, 133], valid: [133, 25], invalid: [25, 25] },
    { failure: 'changes saved member counts', current: [25, 25, 133], valid: [25, 133, 25], invalid: [25, 133, 133] },
  ])('rejects a reorder that $failure', ({ current, valid, invalid }) => {
    usePokedexStore.setState({ sections: { other: current, starter: [1, 4, 7] } });

    usePokedexStore.getState().reorderSection('other', valid);
    expect(usePokedexStore.getState().sections).toEqual({ other: valid, starter: [1, 4, 7] });
    expect(JSON.parse(saved.get(storageKey)!).state.sections).toEqual({ other: valid, starter: [1, 4, 7] });

    usePokedexStore.getState().reorderSection('other', invalid);
    expect(usePokedexStore.getState().sections).toEqual({ other: valid, starter: [1, 4, 7] });
    expect(JSON.parse(saved.get(storageKey)!).state.sections).toEqual({ other: valid, starter: [1, 4, 7] });
  });
});
