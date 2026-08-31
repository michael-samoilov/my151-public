import { describe, expect, it } from 'vitest';
import formsData from '../data/powerupForms.json';
import { CHAMPION_ROW, BOSS_ROW, ELITE_ROW } from './constants';
import {
  cyclePowerup,
  formAt,
  formsFor,
  isPowerupRow,
  type PowerupForms,
} from './powerups';

/**
 * The cycle rules and the harvested data behind them.
 *
 * The data half exists because the harvest is a separate manual step against
 * a table that changes under us: the first run matched `-mega-x`, `-mega-y`
 * and `-mega`, and quietly dropped every `-mega-z`. A test that names the
 * forms it expects turns that class of miss into a failure.
 */

const CHARIZARD = 6;
const LAPRAS = 131;
const ABSOL = 359;
const GROUDON = 383;

describe('powerup rows', () => {
  it('offers powerups on the elite, champion and boss rows only', () => {
    expect(isPowerupRow(ELITE_ROW)).toBe(true);
    expect(isPowerupRow(CHAMPION_ROW)).toBe(true);
    expect(isPowerupRow(BOSS_ROW)).toBe(true);
    // The gym rows are the challenge itself; a leader does not Mega there.
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

  it('gives a Gigantamax-only Pokémon no Mega', () => {
    expect(formsFor(LAPRAS, 'mega')).toEqual([]);
    expect(formsFor(LAPRAS, 'dynamax').map((f) => f.label)).toEqual(['Gigantamax Lapras']);
  });

  it('has a sprite id for every form, and no duplicate labels per species', () => {
    for (const [id, entry] of Object.entries(formsData as PowerupForms)) {
      const labels = [...entry.mega, ...entry.dynamax].map((f) => f.label);
      expect(new Set(labels).size, `species ${id}`).toBe(labels.length);
      for (const form of [...entry.mega, ...entry.dynamax]) {
        expect(Number.isInteger(form.id), `species ${id}`).toBe(true);
      }
    }
  });
});

describe('cycling', () => {
  it('walks a Pokémon through its forms and back to base', () => {
    let p = cyclePowerup(null, 1, 'mega', CHARIZARD);
    expect(p).toEqual({ seat: 1, kind: 'mega', index: 0 });
    p = cyclePowerup(p, 1, 'mega', CHARIZARD);
    expect(p).toEqual({ seat: 1, kind: 'mega', index: 1 });
    expect(cyclePowerup(p, 1, 'mega', CHARIZARD), 'the last press clears it').toBeNull();
  });

  it('moves the card’s single powerup rather than adding a second', () => {
    const mega = cyclePowerup(null, 1, 'mega', CHARIZARD);
    // The other kind on the same seat replaces it.
    expect(cyclePowerup(mega, 1, 'dynamax', CHARIZARD)).toEqual({
      seat: 1,
      kind: 'dynamax',
      index: 0,
    });
    // As does the same kind on another seat.
    expect(cyclePowerup(mega, 3, 'mega', CHARIZARD)).toEqual({ seat: 3, kind: 'mega', index: 0 });
  });

  it('does nothing for a Pokémon without that form', () => {
    const mega = cyclePowerup(null, 1, 'mega', CHARIZARD);
    expect(cyclePowerup(mega, 2, 'mega', LAPRAS), 'Lapras has no Mega').toEqual(mega);
    expect(cyclePowerup(null, 1, 'mega', LAPRAS)).toBeNull();
  });
});

describe('what a cell draws', () => {
  const mega = [{ seat: 1, kind: 'mega', index: 1 }] as const;

  it('draws the form on the powerup rows, for that seat only', () => {
    expect(formAt(mega, ELITE_ROW, 1, CHARIZARD)?.label).toBe('Mega Charizard Y');
    expect(formAt(mega, CHAMPION_ROW, 1, CHARIZARD)?.label).toBe('Mega Charizard Y');
    expect(formAt(mega, BOSS_ROW, 1, CHARIZARD)?.label).toBe('Mega Charizard Y');
    expect(formAt(mega, 1, 1, CHARIZARD), 'a gym row').toBeNull();
    expect(formAt(mega, CHAMPION_ROW, 2, CHARIZARD), 'another seat').toBeNull();
  });

  it('draws one per seat, so a whole team can be powered up', () => {
    // Nothing about a row limits it to one: six seats may each hold their own.
    const team = [
      { seat: 1, kind: 'mega', index: 0 },
      { seat: 2, kind: 'dynamax', index: 0 },
      { seat: 3, kind: 'mega', index: 0 },
    ] as const;
    expect(formAt(team, CHAMPION_ROW, 1, CHARIZARD)?.label).toBe('Mega Charizard X');
    expect(formAt(team, CHAMPION_ROW, 2, LAPRAS)?.label).toContain('Lapras');
    expect(formAt(team, CHAMPION_ROW, 3, ABSOL)?.label).toContain('Absol');
    expect(formAt(team, CHAMPION_ROW, 4, CHARIZARD), 'a seat with none').toBeNull();
  });

  it('falls back to the base sprite when the seat’s Pokémon changes under it', () => {
    // Seat 1 held Charizard on its second Mega; a replacement puts Lapras
    // there, which has neither.
    expect(formAt(mega, CHAMPION_ROW, 1, LAPRAS)).toBeNull();
    // And an index the new occupant cannot reach.
    expect(formAt(mega, CHAMPION_ROW, 1, GROUDON), 'Groudon has one form').toBeNull();
  });
});
