// Adds the official body-shape classification (the 14 dex/HOME shape groups)
// to every entry in src/data/pokemon.json, sourced from the PokeAPI CSV dumps
// cached in docs/biome-research/pokeapi/ (pokemon_species.csv shape_id; alt
// forms resolve through pokemon.csv's species_id). Idempotent — rerunning
// just rewrites the same values.
//
// Run:  node scripts/add-shapes.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const POKEAPI = join(ROOT, 'docs', 'biome-research', 'pokeapi');

// PokeAPI shape ids → identifiers (pokemon_shapes.csv upstream).
const SHAPE_NAMES = {
  1: 'ball', 2: 'squiggle', 3: 'fish', 4: 'arms', 5: 'blob', 6: 'upright',
  7: 'legs', 8: 'quadruped', 9: 'wings', 10: 'tentacles', 11: 'heads',
  12: 'humanoid', 13: 'bug-wings', 14: 'armor',
};

const rows = (f) => readFileSync(join(POKEAPI, f), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));

const speciesShape = new Map(); // species id -> shape name
for (const r of rows('pokemon_species.csv')) {
  const shape = SHAPE_NAMES[Number(r[6])];
  if (shape) speciesShape.set(Number(r[0]), shape);
}
const formSpecies = new Map(rows('pokemon.csv').map((r) => [Number(r[0]), Number(r[2])]));

const pkPath = join(ROOT, 'src', 'data', 'pokemon.json');
const pokemon = JSON.parse(readFileSync(pkPath, 'utf8'));

let set = 0;
const missing = [];
for (const p of pokemon) {
  const speciesId = p.id <= 1025 ? p.id : formSpecies.get(p.id) ?? p.id;
  const shape = speciesShape.get(speciesId);
  if (shape) {
    p.shape = shape;
    set++;
  } else {
    missing.push(`${p.id} ${p.name}`);
  }
}

writeFileSync(pkPath, JSON.stringify(pokemon));
console.log(`shapes set: ${set}/${pokemon.length}`);
if (missing.length) console.log('missing shape:', missing.join(', '));
