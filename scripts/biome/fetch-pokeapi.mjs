// Downloads the PokeAPI CSV dumps needed by the biome pipeline into
// docs/biome-research/pokeapi/. The live PokeAPI (and Bulbapedia/Serebii) are
// blocked by this environment's egress policy, but raw.githubusercontent.com is
// reachable — and the repo's CSV dumps carry encounter data through Gen VIII
// (SwSh + DLC), which is what build-assignments.mjs consumes.
//
// Skip-if-exists so the pipeline is rerunnable offline once the cache is
// committed. Run with:  node scripts/biome/fetch-pokeapi.mjs [--force]

import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'docs', 'biome-research', 'pokeapi');
const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';

const FILES = [
  'encounters.csv',
  'encounter_slots.csv',
  'encounter_methods.csv',
  'location_areas.csv',
  'locations.csv',
  'location_names.csv',
  'versions.csv',
  'version_groups.csv',
  'pokemon_species.csv',
  'pokemon.csv',
  'regions.csv',
];

const force = process.argv.includes('--force');

await mkdir(OUT_DIR, { recursive: true });

for (const file of FILES) {
  const dest = join(OUT_DIR, file);
  if (!force) {
    try {
      await access(dest);
      console.log(`skip   ${file} (cached)`);
      continue;
    } catch {
      /* not cached — fetch below */
    }
  }
  const url = `${BASE}/${file}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`FAIL   ${file}: HTTP ${res.status}`);
    process.exitCode = 1;
    continue;
  }
  const body = await res.text();
  await writeFile(dest, body);
  console.log(`fetch  ${file} (${(body.length / 1024).toFixed(0)} KB)`);
}
