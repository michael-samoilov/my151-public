import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Pokemon } from '@/types/pokemon';

const ROOT = join(import.meta.dirname, '..');
const POKEAPI_SNAPSHOT = join(ROOT, 'data', 'ontology', 'sources', 'pokeapi-bc92d3b6.json');
const POKEMON_JSON = join(ROOT, 'src', 'data', 'pokemon.json');

const pokemon = JSON.parse(readFileSync(POKEMON_JSON, 'utf8')) as Pokemon[];

function officialBabySpeciesIds(): number[] {
  const { species } = JSON.parse(readFileSync(POKEAPI_SNAPSHOT, 'utf8')) as { species: Record<string, { id: number; isBaby: boolean }> };
  return Object.values(species).filter((row) => row.isBaby).map((row) => row.id).sort((a, b) => a - b);
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
