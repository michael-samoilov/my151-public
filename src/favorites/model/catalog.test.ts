import { existsSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
    expect(eligibleFor('gimmick', 8).some((m) => m.id === 10228)).toBe(false);
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
      ['grass', 9, 11014], ['water', 9, 11015], ['fire', 9, 11016], ['rock', 9, 11017],
    ] as const;
    for (const [type, gen, id] of cases) {
      expect(eligibleFor(type, gen).some((m) => m.id === id), `${type}|${gen}:${id}`).toBe(true);
    }
    for (const id of [413, 718, 741, 716, 717]) expect(getPickerMon(id)).toBeDefined();
    expect(eligibleFor('legendary', 6).some((m) => m.id === 11001)).toBe(true);
    expect(getPickerMon(1024)?.sprite).toBe('/sprites/pokemon/1024.png');
    expect(getPickerMon(10276)?.sprite).toBe('/sprites/pokemon/10276.png');
    expect(readFileSync('public/sprites/pokemon/1024.png').equals(readFileSync('public/sprites/pokemon/10276.png'))).toBe(false);
    for (const id of [10276, 10277, 11014, 11015, 11016, 11017]) {
      expect(eligibleFor('gimmick', 9).some((m) => m.id === id), `gimmick|9:${id}`).toBe(true);
      expect(eligibleFor('gimmick', 'legendary').some((m) => m.id === id), `gimmick|legendary:${id}`).toBe(true);
    }
  });

  it('keeps forms next to their species and regional evolutions in line order', () => {
    const ids = (type: Parameters<typeof eligibleFor>[0], gen: Parameters<typeof eligibleFor>[1]) =>
      eligibleFor(type, gen).map((mon) => mon.id);
    const together = (list: number[], expected: number[]) => {
      const start = list.indexOf(expected[0]);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(list.slice(start, start + expected.length)).toEqual(expected);
    };
    together(ids('water', 5), [550, 10016]);
    together(ids('water', 5), [647, 10024]);
    together(ids('ghost', 4), [487, 10007]);
    together(ids('fighting', 8), [892, 10191]);
    together(ids('poison', 8), [10235, 903]);
    together(ids('normal', 5), [585, 11008, 11009, 11010, 586, 11011, 11012, 11013]);
    together(ids('water', 7), [746, 10127]);
    together(ids('grass', 9), [1017, 11014]);
    together(ids('water', 9), [10273, 11015]);
    together(ids('fire', 9), [10274, 11016]);
    together(ids('rock', 9), [10275, 11017]);
    expect(getPickerMon(746)?.sprite).toBe('/sprites/pokemon/746.png');
  });

  it('removes alternate sprites that duplicate the same form', () => {
    for (const id of [10028, 10029, 10031, 10032, 10093, 10116, 10119, 10121, 10122,
      10128, 10129, 10130, 10131, 10132, 10133, 10134, 10135, 10144, 10145,
      10146, 10149, 10150, 10151, 10153, 10154, 10188, 10189, 10228]) {
      expect(getPickerMon(id), String(id)).toBeUndefined();
    }
    const seen = new Set<string>();
    for (const mon of allPickerMons()) {
      if (!existsSync(`public${mon.sprite}`)) continue;
      const hash = createHash('sha256').update(readFileSync(`public${mon.sprite}`)).digest('hex');
      const key = `${mon.ownerId}|${mon.types.join(',')}|${hash}`;
      expect(seen.has(key), `${mon.name} duplicates an earlier form`).toBe(false);
      seen.add(key);
    }
  }, 20_000);
});
