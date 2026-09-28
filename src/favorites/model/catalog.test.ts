// keeps: a catalog error among 1,000+ picker forms (duplicate or missing sprite, wrong generation) that E2E cannot enumerate
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import pokemonData from '@/data/pokemon.json';
import { ALTERNATE_PICKER_FORMS } from './alternateForms';
import { allPickerMons, getPickerMon } from './catalog';
import { eligibleFor } from './eligibility';
import { debutGame } from './debut';

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
      ['grass', 9, 1017], ['water', 9, 10273], ['fire', 9, 10274], ['rock', 9, 10275],
      ['steel', 8, 10188], ['steel', 8, 10189],
    ] as const;
    for (const [type, gen, id] of cases) {
      expect(eligibleFor(type, gen).some((m) => m.id === id), `${type}|${gen}:${id}`).toBe(true);
    }
    for (const id of [413, 718, 741, 716, 717]) expect(getPickerMon(id)).toBeDefined();
    expect(eligibleFor('legendary', 6).some((m) => m.id === 11001)).toBe(true);
    expect(getPickerMon(1024)?.sprite).toBe('/sprites/pokemon/1024.png');
    expect(getPickerMon(10276)?.sprite).toBe('/sprites/pokemon/10276.png');
    expect(readFileSync('public/sprites/pokemon/1024.png').equals(readFileSync('public/sprites/pokemon/10276.png'))).toBe(false);
    for (const id of [10276, 10277]) {
      expect(eligibleFor('gimmick', 9).some((m) => m.id === id), `gimmick|9:${id}`).toBe(true);
      expect(eligibleFor('legendary', 'gimmick').some((m) => m.id === id), `legendary|gimmick:${id}`).toBe(true);
    }
  });

  it('offers twenty distinct Vivillon patterns in Gen 6 Bug without near-duplicate forms', () => {
    const vivillon = eligibleFor('bug', 6).filter((mon) => mon.ownerId === 666);
    expect(vivillon).toHaveLength(20);
    expect(vivillon[0].id).toBe(666); // Meadow, the base form.
    expect(vivillon.map((mon) => mon.id)).toEqual([666, ...Array.from({ length: 19 }, (_, i) => 11018 + i)]);
    expect(new Set(vivillon.map((mon) => createHash('sha256').update(readFileSync(`public${mon.sprite}`)).digest('hex'))).size).toBe(20);
    for (const id of [10027, 10030, 10118]) expect(getPickerMon(id)).toBeUndefined();
    expect(eligibleFor('legendary', 7).filter((mon) => mon.id === 10181)).toHaveLength(1);
  });

  it('offers the Unown alphabet in Gen 2 and its punctuation in Gen 3', () => {
    const gen2 = eligibleFor('psychic', 2).map((mon) => mon.id);
    const gen2Unown = [201, ...Array.from({ length: 25 }, (_, i) => 11037 + i)];
    expect(gen2.filter((id) => gen2Unown.includes(id))).toEqual(gen2Unown);
    expect(gen2.slice(-gen2Unown.length)).toEqual(gen2Unown);
    const gen3 = eligibleFor('psychic', 3).map((mon) => mon.id);
    expect(gen3.filter((id) => [11062, 11063].includes(id))).toEqual([11062, 11063]);
    expect(gen3.slice(-2)).toEqual([11062, 11063]);
    expect(eligibleFor('electric', 4).some((mon) => mon.id === 11064)).toBe(true);
    expect(eligibleFor('electric', 2).some((mon) => mon.id === 11064)).toBe(false);
  });

  it('offers distinct sea, gender, flower, and regional Zen forms without nonmatching trims', () => {
    const ids = (type: Parameters<typeof eligibleFor>[0], gen: Parameters<typeof eligibleFor>[1]) =>
      eligibleFor(type, gen).map((mon) => mon.id);
    for (const [type, gen, expected] of [
      ['water', 4, [422, 11065, 423, 11066]],
      ['ground', 4, [449, 11067, 450, 11068]],
      ['water', 5, [592, 11069, 593, 11070]],
      ['fire', 6, [668, 11071]],
      ['fairy', 6, [669, 11082, 11083, 11084, 11085, 670, 11086, 11087, 11088, 11089]],
    ] as const) {
      const list = ids(type, gen);
      const start = list.indexOf(expected[0]);
      expect(start, `${type}|${gen}`).toBeGreaterThanOrEqual(0);
      expect(list.slice(start, start + expected.length), `${type}|${gen}`).toEqual(expected);
    }
    expect(ids('fairy', 6).slice(ids('fairy', 6).indexOf(671), ids('fairy', 6).indexOf(671) + 5)).toEqual([
      671, 11090, 11091, 11092, 11093,
    ]);
    expect(ids('ice', 8)).toContain(11072);
    expect(ids('fire', 8)).toContain(11072);
    expect(ids('gimmick', 8)).toContain(11072);
    expect(ids('psychic', 8)).toContain(10186); // Indeedee female already existed.
    expect(ids('dragon', 9)).toEqual(expect.arrayContaining([978, 11006, 11007]));
    expect(ids('normal', 6)).toContain(676);
    for (let id = 11073; id <= 11081; id += 1) expect(getPickerMon(id)).toBeUndefined();
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
    together(ids('poison', 8), [10235, 903]);
    together(ids('normal', 5), [585, 11008, 11009, 11010, 586, 11011, 11012, 11013]);
    together(ids('water', 7), [746, 10127]);
    expect(ids('fighting', 8).indexOf(10191)).toBeGreaterThan(ids('fighting', 8).indexOf(892));
    expect(getPickerMon(1017)?.sprite).toBe('/sprites/pokemon/1017.png');
    for (const id of [11014, 11015, 11016, 11017]) expect(getPickerMon(id)).toBeUndefined();
    together(ids('fairy', 8), [888, 10188]);
    // Crowned Zamazenta is a battle form, so it closes the Sword and Shield entries.
    const fighting = eligibleFor('fighting', 8);
    const crowned = fighting.findIndex((mon) => mon.id === 10189);
    expect(fighting.slice(0, crowned).every((mon) => debutGame(mon) === 'SwSh')).toBe(true);
    expect(debutGame(fighting[crowned + 1])).toBe('PLA');
    expect(getPickerMon(888)?.types).toEqual(['fairy']);
    expect(getPickerMon(888)?.sprite).toBe('/sprites/pokemon/888.png');
    expect(getPickerMon(889)?.sprite).toBe('/sprites/pokemon/889.png');
    expect(getPickerMon(889)?.types).toEqual(['fighting']);
    expect(getPickerMon(746)?.sprite).toBe('/sprites/pokemon/746.png');
  });

  it('removes alternate sprites that duplicate the same form', () => {
    for (const id of [10028, 10029, 10031, 10032, 10093, 10116, 10119, 10121, 10122,
      10128, 10129, 10130, 10131, 10132, 10133, 10134, 10135, 10144, 10145,
      10146, 10149, 10150, 10151, 10153, 10154, 10228]) {
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
