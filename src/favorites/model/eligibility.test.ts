import { describe, expect, it } from 'vitest';
import { eligibleFor, isEmptyTypeGen, kindFor, regionalPickerTier } from './eligibility';
import { isLegendaryEligible, isPowerupForm } from './catalog';
import { TYPE_NAMES } from '@/types/pokemon';

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
    expect(g8.slice(-3).map((m) => m.id)).toEqual([10233, 10236, 10244]);
  });

  it('uses regular Gen 1 Pikachu and Eevee as starters without duplicating LGPE variants in Gen 7', () => {
    const g1 = eligibleFor('starter', 1).map((m) => m.id);
    expect(g1.slice(-2)).toEqual([25, 133]);
    expect(eligibleFor('starter', 7).some((m) => m.id === 25 || m.id === 133 || m.id === 10158 || m.id === 10159)).toBe(false);
    expect(eligibleFor('electric', 1).filter((m) => m.id === 25)).toHaveLength(1);
    expect(eligibleFor('normal', 1).filter((m) => m.id === 133)).toHaveLength(1);
    expect(eligibleFor('electric', 7).some((m) => m.id === 10158)).toBe(false);
    expect(eligibleFor('normal', 7).some((m) => m.id === 10159)).toBe(false);
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

  it('orders native, older-family, legendary, and older legendary families consistently', () => {
    for (const gen of [1, 2, 3, 4, 5, 6, 7, 8, 9] as const) {
      for (const type of [...TYPE_NAMES, 'gimmick', 'legendary'] as const) {
        const mons = eligibleFor(type, gen);
        const tiers = mons.map(regionalPickerTier);
        expect(tiers, `${type}|${gen}`).toEqual(tiers.slice().sort((a, b) => a - b));
        const firstLegendary = mons.findIndex(isLegendaryEligible);
        if (firstLegendary >= 0) {
          expect(mons.slice(firstLegendary).every(isLegendaryEligible), `${type}|${gen} legendary tail`).toBe(true);
        }
      }
    }
  });

  it('keeps same-generation legendary forms together before older legendary families', () => {
    const ids = (type: Parameters<typeof eligibleFor>[0], gen: Parameters<typeof eligibleFor>[1]) =>
      eligibleFor(type, gen).map((mon) => mon.id);
    const contiguous = (list: number[], family: number[]) => {
      const positions = family.map((id) => list.indexOf(id));
      expect(positions.every((position) => position >= 0), String(family)).toBe(true);
      expect(Math.max(...positions) - Math.min(...positions)).toBe(family.length - 1);
    };
    contiguous(ids('legendary', 8), [892, 10191]);
    contiguous(ids('legendary', 8), [893, 10192]);
    contiguous(ids('legendary', 8), [898, 10193, 10194]);
    contiguous(ids('legendary', 8), [905, 10249]);
    contiguous(ids('legendary', 6), [716, 11001]);
    contiguous(ids('legendary', 7), [800, 10155, 10156, 10157]);
    contiguous(ids('legendary', 7), [801, 10147]);
    expect(ids('legendary', 8).indexOf(10246)).toBeGreaterThan(ids('legendary', 8).indexOf(892));
    expect(ids('legendary', 7).indexOf(10181)).toBeGreaterThan(ids('legendary', 7).indexOf(785));
  });

  it('offers Ultra Necrozma in the Gen 7 and legendary gimmick selectors', () => {
    expect(eligibleFor('gimmick', 7).some((mon) => mon.id === 10157)).toBe(true);
    expect(eligibleFor('gimmick', 'legendary').some((mon) => mon.id === 10157)).toBe(true);
  });
});
