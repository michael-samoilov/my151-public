/** Rebuild API eligibility from the same catalogue and pointer rules as the Picker. */
import { readFileSync, writeFileSync } from 'node:fs';
import { GEN_AXIS, TYPE_AXIS, cellKey } from '../src/favorites/model/cells';
import { eligibleFor, kindFor } from '../src/favorites/model/eligibility';
import { pointerPool } from '../src/favorites/model/pointers';
import { allPickerMons, pickerDexId } from '../src/favorites/model/catalog';
import pokemonData from '../src/data/pokemon.json';
import reviewedIdentities from './i18n/pokemon-id-map.json';
const cells: Record<string,{kind:string;ids?:number[];sources?:string[]}> = {};
const positions = GEN_AXIS.flatMap(gen=>TYPE_AXIS.map(type=>({type,gen,key:cellKey(type,gen)})));
for(const {type,gen,key} of positions) {
  const kind=kindFor(type,gen);
  if(kind==='pick')cells[key]={kind,ids:eligibleFor(type,gen).map(mon=>mon.id)};
  if(kind==='pointer')cells[key]={kind,sources:positions.filter(position=>pointerPool(type,gen,{[position.key]:1}).includes(1)).map(position=>position.key)};
}
// Regional saved IDs are not upstream IDs. Use the reviewed species identity,
// rather than treating an evolution line or a form's saved owner as a species.
const dex = new Map(pokemonData.map(mon => [mon.id, mon]));
const identities = new Map(reviewedIdentities.entries.map(entry => [entry.appId, entry]));
const species: Record<string, number> = {};
const catalogue = allPickerMons();
const pickerIds = new Set(catalogue.map(mon => mon.id));
for (const mon of [...catalogue].sort((a, b) => a.id - b.id)) {
  const dexId = pickerDexId(mon);
  const identity = identities.get(dexId);
  if (!identity || identity.appName !== dex.get(dexId)?.name || !pickerIds.has(identity.speciesId)) {
    throw new Error(`Unreviewed Picker species identity: ${mon.id} ${mon.name}. Refresh scripts/i18n/pokemon-id-map.json.`);
  }
  species[mon.id] = identity.speciesId;
}
for (const cell of Object.values(cells)) {
  for (const id of cell.ids ?? []) {
    if (species[id] === undefined) throw new Error(`Missing Picker species identity: ${id}`);
  }
}
const outputs = [
  ['../api/_favoriteCells.json', JSON.stringify(cells)],
  ['../api/_favoriteSpecies.json', JSON.stringify(species) + '\n'],
] as const;
for (const [path, serialized] of outputs) {
  const destination = new URL(path, import.meta.url);
  if (process.argv.includes('--check')) {
    if (readFileSync(destination, 'utf8') !== serialized) {
      throw new Error(`Picker API fixture is stale: ${path}. Rebuild with tsx --tsconfig tsconfig.app.json scripts/build-favorite-analytics-cells.ts`);
    }
  } else writeFileSync(destination, serialized);
}
