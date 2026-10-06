// Adds official Pokédex color (pokemon_colors: 10 groups) and egg groups
// (egg_groups: up to 2 per species) to every entry in src/data/pokemon.json,
// sourced from the PokeAPI CSV dumps cached in docs/biome-research/pokeapi/
// (pokemon_species.csv color_id; pokemon_egg_groups.csv species_id→egg_group_id;
// alt forms resolve through pokemon.csv's species_id). Idempotent — rerunning
// just rewrites the same values. No hallucination: every value comes from the
// official CSVs.
//
// Run:  node scripts/add-color-egg.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { sourceSpeciesId } from './pokemon-source-identity.mjs';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const POKEAPI = join(ROOT, 'docs', 'biome-research', 'pokeapi');

const rows = (f) => readFileSync(join(POKEAPI, f), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));

// color id -> identifier (pokemon_colors.csv)
const colorName = new Map(rows('pokemon_colors.csv').map((r) => [Number(r[0]), r[1]]));
// egg group id -> identifier (egg_groups.csv)
const eggName = new Map(rows('egg_groups.csv').map((r) => [Number(r[0]), r[1]]));

// species id -> color identifier (pokemon_species.csv col 5 = color_id)
const speciesColor = new Map();
for (const r of rows('pokemon_species.csv')) {
  const c = colorName.get(Number(r[5]));
  if (c) speciesColor.set(Number(r[0]), c);
}

// species id -> [egg group identifiers] (preserve CSV order, cap at 2)
const speciesEgg = new Map();
for (const r of rows('pokemon_egg_groups.csv')) {
  const sid = Number(r[0]);
  const g = eggName.get(Number(r[1]));
  if (!g) continue;
  const arr = speciesEgg.get(sid) ?? [];
  if (!arr.includes(g)) arr.push(g);
  speciesEgg.set(sid, arr);
}

const formColors = JSON.parse(readFileSync(join(ROOT, 'scripts', 'data', 'form-color-overrides.json'), 'utf8'));

const pkPath = join(ROOT, 'src', 'data', 'pokemon.json');
const pokemon = JSON.parse(readFileSync(pkPath, 'utf8'));

let colorSet = 0;
let eggSet = 0;
const missingColor = [];
const missingEgg = [];
for (const p of pokemon) {
  const speciesId = sourceSpeciesId(p);
  const formColor = formColors[p.id];
  if (formColor && (formColor.name !== p.name || formColor.speciesId !== speciesId)) throw new Error(`Stale form color identity: ${p.id} ${p.name}`);
  const color = formColor?.color ?? speciesColor.get(speciesId);
  if (color) { p.color = color; colorSet++; } else { missingColor.push(`${p.id} ${p.name}`); }
  const eggs = speciesEgg.get(speciesId);
  if (eggs && eggs.length) { p.eggGroups = eggs; eggSet++; } else { p.eggGroups = []; missingEgg.push(`${p.id} ${p.name}`); }
}

writeFileSync(pkPath, JSON.stringify(pokemon));
console.log(`color set: ${colorSet}/${pokemon.length}`);
console.log(`eggGroups set: ${eggSet}/${pokemon.length}`);
if (missingColor.length) console.log('missing color:', missingColor.slice(0, 30).join(', '), missingColor.length > 30 ? `(+${missingColor.length - 30})` : '');
if (missingEgg.length) console.log('missing eggGroups:', missingEgg.slice(0, 30).join(', '), missingEgg.length > 30 ? `(+${missingEgg.length - 30})` : '');
