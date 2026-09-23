import { existsSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pokemonData from '@/data/pokemon.json';
import { ALTERNATE_PICKER_FORMS } from './alternateForms';
import { allPickerMons, getPickerMon } from './catalog';
import { eligibleFor } from './eligibility';

describe('alternate picker forms', () => {
  it('keeps the new form catalog inside the picker and resolves local sprites', () => {
    const dexIds = new Set(pokemonData.map((p) => p.id));
    expect(dexIds.size).toBe(1089);
    for (const form of ALTERNATE_PICKER_FORMS) {
      const mon = getPickerMon(form.id);
      expect(mon?.name, String(form.id)).toBe(form.name);
      expect(mon?.types, String(form.id)).toEqual(form.types);
      expect(existsSync(`public${mon?.sprite}`), String(form.id)).toBe(true);
      expect(statSync(`public${mon?.sprite}`).size, String(form.id)).toBeGreaterThan(100);
      if (form.id !== 10191) expect(dexIds.has(form.id), String(form.id)).toBe(false);
    }
    expect(new Set(allPickerMons().map((m) => m.id)).size).toBe(allPickerMons().length);
    expect(allPickerMons().filter((mon) => /shiny/i.test(mon.name) || /\/shiny\//i.test(mon.sprite))).toEqual([]);
  });

  it('separates regular and Gigantamax Urshifu forms by ID and cell', () => {
    expect(getPickerMon(892)?.name).toBe('urshifu-single-strike');
    expect(getPickerMon(10191)?.name).toBe('urshifu-rapid-strike');
    expect(getPickerMon(10226)?.source).toBe('powerup');
    expect(getPickerMon(10227)?.name).toBe('Gigantamax Urshifu Rapid Strike');
    expect(eligibleFor('water', 8).some((m) => m.id === 10191)).toBe(true);
    expect(eligibleFor('water', 8).some((m) => m.id === 10227)).toBe(false);
    expect(eligibleFor('gimmick', 8).some((m) => m.id === 10227)).toBe(true);
    expect(eligibleFor('gimmick', 8).some((m) => m.id === 10228)).toBe(true);
  });

  it('offers each requested alternate family in the appropriate generations', () => {
    const cases = [
      ['ghost', 4, 10007], ['steel', 8, 10245], ['water', 8, 10246],
      ['psychic', 8, 10193], ['ghost', 8, 10194], ['ground', 7, 10181],
      ['dragon', 7, 10120], ['flying', 5, 10019], ['flying', 5, 10020],
      ['flying', 5, 10021], ['flying', 8, 10249], ['steel', 7, 10155],
      ['ghost', 7, 10156], ['dragon', 7, 10157], ['normal', 9, 10276],
      ['normal', 9, 10277], ['dragon', 8, 10190], ['electric', 7, 10123],
      ['psychic', 7, 10124], ['ghost', 7, 10125], ['ground', 4, 10004],
      ['steel', 4, 10005], ['fairy', 6, 11001],
    ] as const;
    for (const [type, gen, id] of cases) {
      expect(eligibleFor(type, gen).some((m) => m.id === id), `${type}|${gen}:${id}`).toBe(true);
    }
    for (const id of [413, 718, 741, 716, 717]) expect(getPickerMon(id)).toBeDefined();
    expect(eligibleFor('legendary', 6).some((m) => m.id === 11001)).toBe(true);
  });
});
