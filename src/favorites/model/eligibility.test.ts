// keeps: a wrong candidate list in one of the 264 grid cells, which E2E cannot open one by one
import { describe, expect, it } from 'vitest';
import { eligibleFor, isEmptyTypePicker, kindFor } from './eligibility';
import { isBattleForm, regionalPickerTier } from './sortKeys';
import { isLegendaryEligible, isPowerupForm } from './catalog';
import { debutRank } from './debut';
import { TYPE_NAMES } from '@/types/pokemon';

describe('eligibleFor', () => {
  it('leaves Gen I Dark empty and Gen I Fire holding Charmander', () => {
    expect(isEmptyTypePicker('dark', 1)).toBe(true);
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

  it('uses the Gimmick column candidate set across the new type-filtered row', () => {
    for (const type of TYPE_NAMES) {
      const picks = eligibleFor(type, 'gimmick');
      expect(picks.every((mon) => mon.types.includes(type)), type).toBe(true);
      expect(kindFor(type, 'gimmick')).toBe(picks.length ? 'pick' : 'null');
    }
    const allGimmicks = new Set(
      ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).flatMap((gen) => eligibleFor('gimmick', gen).map((mon) => mon.id)),
    );
    for (const type of TYPE_NAMES) {
      expect(eligibleFor(type, 'gimmick').every((mon) => allGimmicks.has(mon.id)), type).toBe(true);
    }
  });

  it('offers gimmick forms of starter species, including Pikachu and Eevee but not Raichu', () => {
    const ids = eligibleFor('starter', 'gimmick').map((mon) => mon.id);
    expect(kindFor('starter', 'gimmick')).toBe('pick');
    expect(ids).toContain(10034); // Mega Charizard X
    expect(ids).toContain(10199); // Gigantamax Pikachu
    expect(ids).toContain(10205); // Gigantamax Eevee
    expect(ids).not.toContain(10304); // Mega Raichu X
    expect(ids).not.toContain(10305); // Mega Raichu Y
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

  it('keeps only the Legendary-column, Gimmick-row intersection selectable', () => {
    expect(kindFor('gimmick', 'legendary')).toBe('disabled');
    expect(kindFor('legendary', 'gimmick')).toBe('pick');
    expect(eligibleFor('legendary', 'gimmick').length).toBeGreaterThan(0);
  });

  it('orders by debut game, then regular before battle forms, then native, older-family, legendary, and older legendary families', () => {
    for (const gen of [1, 2, 3, 4, 5, 6, 7, 8, 9] as const) {
      for (const type of [...TYPE_NAMES, 'gimmick', 'legendary'] as const) {
        const mons = eligibleFor(type, gen);
        const tieredMons = type === 'psychic' && (gen === 2 || gen === 3)
          ? mons.filter((mon) => mon.ownerId !== 201)
          : mons;
        const ranks = tieredMons.map(debutRank);
        expect(ranks, `${type}|${gen} debut games`).toEqual(ranks.slice().sort((a, b) => a - b));
        for (const rank of new Set(ranks)) {
          const game = tieredMons.filter((mon) => debutRank(mon) === rank);
          const kinds = game.map((mon) => Number(isBattleForm(mon)));
          expect(kinds, `${type}|${gen} battle forms`).toEqual(kinds.slice().sort((a, b) => a - b));
          for (const kind of new Set(kinds)) {
            const group = game.filter((mon) => Number(isBattleForm(mon)) === kind);
            const tiers = group.map(regionalPickerTier);
            expect(tiers, `${type}|${gen}`).toEqual(tiers.slice().sort((a, b) => a - b));
            const firstLegendary = group.findIndex(isLegendaryEligible);
            if (firstLegendary >= 0) {
              expect(group.slice(firstLegendary).every(isLegendaryEligible), `${type}|${gen} legendary tail`).toBe(true);
            }
          }
        }
      }
    }
  });

  it('keeps same-game legendary forms together before older legendary families', () => {
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
    // Necrozma's fusions debuted in Ultra Sun and Ultra Moon, after every Sun and Moon entry.
    contiguous(ids('legendary', 7), [10155, 10156, 803]);
    // Ultra Necrozma is a battle form, so it closes the Ultra Sun and Ultra Moon entries.
    expect(ids('legendary', 7).indexOf(10157)).toBe(ids('legendary', 7).indexOf(807) + 1);
    contiguous(ids('legendary', 7), [801, 10147]);
    expect(ids('legendary', 8).indexOf(10246)).toBeGreaterThan(ids('legendary', 8).indexOf(892));
    expect(ids('legendary', 7).indexOf(10181)).toBeGreaterThan(ids('legendary', 7).indexOf(785));
  });

  it('offers Ultra Necrozma in the Gen 7 and legendary gimmick selectors', () => {
    expect(eligibleFor('gimmick', 7).some((mon) => mon.id === 10157)).toBe(true);
    expect(eligibleFor('legendary', 'gimmick').some((mon) => mon.id === 10157)).toBe(true);
  });
});
