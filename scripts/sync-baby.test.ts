import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Pokemon } from '@/types/pokemon';

const ROOT = join(import.meta.dirname, '..');
const CSV = join(ROOT, 'docs', 'biome-research', 'pokeapi', 'pokemon_species.csv');
const POKEMON_JSON = join(ROOT, 'src', 'data', 'pokemon.json');

const pokemon = JSON.parse(readFileSync(POKEMON_JSON, 'utf8')) as Pokemon[];

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
    const flagged = pokemon
      .filter((p) => p.isBaby && p.id <= 1025)
      .map((p) => p.id)
      .sort((a, b) => a - b);

    expect(flagged).toEqual(officialBabySpeciesIds());
  });
});
