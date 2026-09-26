import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Pokemon } from '@/types/pokemon';

/**
 * Guards the "Baby Pokemon" classification, which filters on `isBaby`. That
 * flag is copied from PokeAPI's `pokemon_species.csv is_baby` column, and
 * pokemon.json was generated before that column flagged Toxel (848). So the
 * data silently carried 18 of the 19 official baby species, and the
 * classification was missing a whole evo line.
 *
 * Both sides of the comparison are checked-in files, so this needs no network.
 * Re-sync with `node scripts/sync-baby.mjs` when it fails.
 */

const ROOT = join(import.meta.dirname, '..');
const CSV = join(ROOT, 'docs', 'biome-research', 'pokeapi', 'pokemon_species.csv');
const POKEMON_JSON = join(ROOT, 'src', 'data', 'pokemon.json');

const pokemon = JSON.parse(readFileSync(POKEMON_JSON, 'utf8')) as Pokemon[];

/** Species ids PokeAPI marks `is_baby`, read from the cached CSV dump. */
function officialBabySpeciesIds(): number[] {
  const lines = readFileSync(CSV, 'utf8').trim().split('\n');
  const babyCol = lines[0].split(',').indexOf('is_baby');
  expect(babyCol, 'pokemon_species.csv has no is_baby column').toBeGreaterThan(-1);

  const ids: number[] = [];
  for (const line of lines.slice(1)) {
    const row = line.split(',');
    if (row[babyCol] === '1') ids.push(Number(row[0]));
  }
  return ids.sort((a, b) => a - b);
}

describe('isBaby matches the official species data', () => {
  it('flags exactly the species PokeAPI marks as babies', () => {
    // Alt forms (id > 1025) inherit the flag from their species, so compare
    // base species only — that is what the CSV enumerates.
    const flagged = pokemon
      .filter((p) => p.isBaby && p.id <= 1025)
      .map((p) => p.id)
      .sort((a, b) => a - b);

    expect(flagged).toEqual(officialBabySpeciesIds());
  });
});
