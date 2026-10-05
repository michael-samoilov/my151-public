/** Rebuild API eligibility from the same catalogue and pointer rules as the Picker. */
import { readFileSync, writeFileSync } from 'node:fs';
import { GEN_AXIS, TYPE_AXIS, cellKey } from '../src/favorites/model/cells';
import { eligibleFor, kindFor } from '../src/favorites/model/eligibility';
import { pointerPool } from '../src/favorites/model/pointers';
const cells: Record<string,{kind:string;ids?:number[];sources?:string[]}> = {};
const positions = GEN_AXIS.flatMap(gen=>TYPE_AXIS.map(type=>({type,gen,key:cellKey(type,gen)})));
for(const {type,gen,key} of positions) {
  const kind=kindFor(type,gen);
  if(kind==='pick')cells[key]={kind,ids:eligibleFor(type,gen).map(mon=>mon.id)};
  if(kind==='pointer')cells[key]={kind,sources:positions.filter(position=>pointerPool(type,gen,{[position.key]:1}).includes(1)).map(position=>position.key)};
}
const destination=new URL('../api/_favoriteCells.json',import.meta.url);
const serialized=JSON.stringify(cells);
if(process.argv.includes('--check')) {
  if(readFileSync(destination,'utf8')!==serialized)throw new Error('Picker API eligibility is stale. Rebuild with tsx --tsconfig tsconfig.app.json scripts/build-favorite-analytics-cells.ts');
} else writeFileSync(destination,serialized);
