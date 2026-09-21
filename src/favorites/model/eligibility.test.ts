import { describe, expect, it } from 'vitest';
import { eligibleFor, isEmptyTypeGen, kindFor } from './eligibility';
import { isPowerupForm } from './catalog';

describe('eligibleFor', () => {
  it('leaves Gen I Dark empty and Gen I Fire holding Charmander', () => {
    expect(isEmptyTypeGen('dark', 1)).toBe(true);
    expect(kindFor('dark', 1)).toBe('null');
    const fire = eligibleFor('fire', 1);
    expect(fire.some((m) => m.id === 4)).toBe(true);
    expect(fire.every((m) => !isPowerupForm(m))).toBe(true);
  });

  it('keeps Mega Charizard out of type×gen and in gimmick × gen 1', () => {
    const fire = eligibleFor('fire', 1);
    expect(fire.some((m) => m.name.toLowerCase().includes('mega'))).toBe(false);
    const gimmick = eligibleFor('gimmick', 1);
    expect(gimmick.some((m) => m.id === 10034 || m.name.includes('Mega Charizard'))).toBe(true);
  });

  it('puts Hisuian Typhlosion in gen 8 starters, not gen 2', () => {
    const g8 = eligibleFor('starter', 8);
    const g2 = eligibleFor('starter', 2);
    expect(g8.some((m) => m.id === 10233)).toBe(true);
    expect(g2.some((m) => m.id === 10233)).toBe(false);
    expect(g2.some((m) => m.id === 155)).toBe(true);
  });

  it('keeps gens 1–5 gimmick pickers non-empty', () => {
    for (const gen of [1, 2, 3, 4, 5] as const) {
      expect(eligibleFor('gimmick', gen).length, `gimmick×${gen}`).toBeGreaterThan(0);
    }
  });

  it('offers a gimmick × legendary pick', () => {
    expect(kindFor('gimmick', 'legendary')).toBe('pick');
    expect(eligibleFor('gimmick', 'legendary').length).toBeGreaterThan(0);
  });
});
