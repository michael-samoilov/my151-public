// Syncs the official "baby Pokémon" flag (pokemon_species.csv is_baby) onto
// every entry in src/data/pokemon.json, sourced from the PokeAPI CSV dumps
// cached in docs/biome-research/pokeapi/ (alt forms resolve through
// pokemon.csv's species_id). Idempotent — rerunning just rewrites the same
// values. No hallucination: every value comes from the official CSVs.
//
// The flag drives the "Baby Pokemon" classification in src/data/categories.ts.
// pokemon.json was generated before PokeAPI flagged Toxel (848, the only baby
// introduced after Gen 4), so it carried 18 of the 19 official baby species.
//
// Run:  node scripts/sync-baby.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const POKEAPI = join(ROOT, 'docs', 'biome-research', 'pokeapi');

const rows = (f) => readFileSync(join(POKEAPI, f), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));

// species id -> is_baby (pokemon_species.csv col 8 = is_baby)
const speciesHeader = readFileSync(join(POKEAPI, 'pokemon_species.csv'), 'utf8').split('\n')[0].split(',');
const babyCol = speciesHeader.indexOf('is_baby');
if (babyCol === -1) throw new Error('pokemon_species.csv has no is_baby column');

const speciesBaby = new Map(rows('pokemon_species.csv').map((r) => [Number(r[0]), r[babyCol] === '1']));

const formSpecies = new Map(rows('pokemon.csv').map((r) => [Number(r[0]), Number(r[2])]));

const pkPath = join(ROOT, 'src', 'data', 'pokemon.json');
const pokemon = JSON.parse(readFileSync(pkPath, 'utf8'));

let babyCount = 0;
const changed = [];
for (const p of pokemon) {
  const speciesId = p.id <= 1025 ? p.id : formSpecies.get(p.id) ?? p.id;
  const isBaby = speciesBaby.get(speciesId) ?? false;
  if (p.isBaby !== isBaby) changed.push(`${p.id} ${p.name}: ${p.isBaby} -> ${isBaby}`);
  p.isBaby = isBaby;
  if (isBaby) babyCount++;
}

writeFileSync(pkPath, JSON.stringify(pokemon));
console.log(`isBaby set: ${babyCount}/${pokemon.length} entries flagged baby`);
console.log(changed.length ? `changed: ${changed.join(', ')}` : 'changed: none (already in sync)');
