

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const POKEAPI = join(ROOT, 'docs', 'biome-research', 'pokeapi');

const rows = (f) => readFileSync(join(POKEAPI, f), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));

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
