import { describe, it, expect } from 'vitest';
import { getPokemonByIds, getPokemonById } from './usePokemonData';

// Smoke test verifying the test harness end-to-end against a pure, deterministic
// helper. Not a behavior-locking characterization test — those come next.
describe('getPokemonByIds', () => {
  it('resolves valid ids to Pokemon records', () => {
    const result = getPokemonByIds([1, 4, 7]);
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.id)).toEqual([1, 4, 7]);
  });

  it('silently drops ids that do not resolve', () => {
    expect(getPokemonByIds([1, 999999])).toHaveLength(1);
    expect(getPokemonByIds([999999])).toHaveLength(0);
  });

  it('returns an empty array for no ids', () => {
    expect(getPokemonByIds([])).toEqual([]);
  });

  it('accepts any iterable (e.g. a Set)', () => {
    expect(getPokemonByIds(new Set([1, 1, 4]))).toHaveLength(2);
  });

  it('agrees with getPokemonById for each resolved id', () => {
    for (const p of getPokemonByIds([1, 25, 150])) {
      expect(getPokemonById(p.id)).toBe(p);
    }
  });
});
