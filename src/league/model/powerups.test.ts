import { describe, expect, it } from 'vitest';
import { CHAMPION_ROW, BOSS_ROW, ELITE_ROW } from './constants';
import { formsFor, isPowerupRow } from './powerups';

const CHARIZARD = 6;
const ABSOL = 359;
const GROUDON = 383;

describe('powerup rows', () => {
  it('offers powerups on the elite, champion and boss rows only', () => {
    expect(isPowerupRow(ELITE_ROW)).toBe(true);
    expect(isPowerupRow(CHAMPION_ROW)).toBe(true);
    expect(isPowerupRow(BOSS_ROW)).toBe(true);
    for (let row = 1; row < ELITE_ROW; row += 1) expect(isPowerupRow(row)).toBe(false);
  });
});

describe('harvested forms', () => {
  it('carries every lettered Mega, including the Z forms', () => {
    expect(formsFor(CHARIZARD, 'mega').map((f) => f.label)).toEqual([
      'Mega Charizard X',
      'Mega Charizard Y',
    ]);
    expect(formsFor(ABSOL, 'mega').map((f) => f.label)).toEqual(['Mega Absol', 'Mega Absol Z']);
  });

  it('files a Primal Reversion under the Mega button', () => {
    expect(formsFor(GROUDON, 'mega').map((f) => f.label)).toEqual(['Primal Groudon']);
    expect(formsFor(GROUDON, 'dynamax')).toEqual([]);
  });
});
