import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { allPickerMons, pickerDexId } from '../src/favorites/model/catalog';
import reviewed from './i18n/pokemon-id-map.json';
import powerups from '../docs/favorite-picker-work/form-types/provenance.json';
import formAudit from '../docs/favorite-picker-work/form-metadata-audit/provenance.json';
const revision='bc92d3b6029ef1abe9e7ad424c400b338f3c11fe';
const directory=process.argv[2];if(!directory)throw Error('Provide a directory of pokemon.csv, pokemon_forms.csv and pokemon_stats.csv from the pinned revision.');
function table(name:string){const raw=readFileSync(`${directory}/${name}.csv`,'utf8'),[head,...lines]=raw.trim().split('\n');const fields=head.split(',');return {name,sha256:createHash('sha256').update(raw).digest('hex'),rows:lines.map(line=>Object.fromEntries(line.split(',').map((v,i)=>[fields[i],v])))};}
const pokemon=table('pokemon'),forms=table('pokemon_forms'),stats=table('pokemon_stats');
if(forms.sha256!=='99bf8f7ad4dc1f2e291357a090cef6a575623ec3cbf9030d0e33656e6e608ae2'||stats.sha256!=='fa2c44263a3706468682fefc3e0b3c4f5487fe9febed7d4ebcd6939c34b16aa8')throw Error('Form/stats CSV differs from pinned source.');
if(pokemon.sha256!=='16c81c33188b0eac403aa2f759fcbe9e42c611f722d263f5b5a6a5bff9f8ce6b')throw Error('pokemon.csv does not match reviewed immutable source.');
const byId=new Map(pokemon.rows.map(row=>[Number(row.id),row]));const byName=new Map(pokemon.rows.map(row=>[row.identifier,row]));
const formByName=new Map(forms.rows.map(row=>[row.identifier,row]));const map=new Map(reviewed.entries.map(row=>[row.appId,row]));
const bst:Record<number,number>={},inventory:unknown[]=[],unknown:unknown[]=[];
const cosmeticGenderIds=new Set([11067,11068,11094,11095]);
const borrowedRecords=new Map([[11105,'reshiram'],[11106,'zekrom'],[11107,'kyurem-black'],[11108,'kyurem-white'],[11109,'solgaleo'],[11110,'lunala'],[11111,'marshadow'],[11112,'rotom'],[11113,'ogerpon'],[11114,'ogerpon-wellspring-mask'],[11115,'ogerpon-hearthflame-mask'],[11116,'ogerpon-cornerstone-mask'],[11117,'smeargle'],[11120,'snorlax'],[11121,'pikachu'],[11122,'kecleon'],[11123,'lugia'],[11124,'dialga'],[11125,'tinkaton'],[11126,'tangrowth'],[11127,'greedent'],[11129,'pichu'],[11130,'mewtwo']]);
for(const mon of allPickerMons()){
 const reviewedMon=map.get(pickerDexId(mon)),owner=map.get(mon.ownerId),speciesId=reviewedMon?.speciesId??owner?.speciesId??mon.ownerId;
 let row;
 const slug=mon.name.toLowerCase().replaceAll(' ','-');
 const formSlug=slug==='vivillon-pokeball'?'vivillon-poke-ball':/^alcremie-(berry|love|star|clover|flower|ribbon)$/.test(slug)?`alcremie-vanilla-cream-${slug.slice(9)}-sweet`:slug;
 const form=formByName.get(formSlug);
 row=byName.get(slug)??(form?byId.get(Number(form.pokemon_id)):undefined);
 if(!row&&reviewedMon&&mon.id===pickerDexId(mon)){const candidate=byName.get(reviewedMon.formIdentifier);if(candidate)row=candidate;}
 const battle=powerups.forms.find(form=>form.id===mon.id);if(!row&&battle){const candidate=byId.get(battle.id);if(candidate?.identifier===battle.identifier&&Number(candidate.species_id)===battle.owner)row=candidate;}
 if(!row&&cosmeticGenderIds.has(mon.id)){const candidate=byId.get(speciesId);if(candidate&&Number(candidate.species_id)===speciesId)row=candidate;}
 if(!row&&borrowedRecords.has(mon.id))row=byName.get(borrowedRecords.get(mon.id)!);
 if(!row||Number(row.species_id)!==speciesId){unknown.push({id:mon.id,name:mon.name,reason:'No identity-checked upstream Pokémon/form mapping'});continue;}
 const values=stats.rows.filter(s=>Number(s.pokemon_id)===Number(row.id));
 if(values.length!==6||new Set(values.map(v=>v.stat_id)).size!==6||values.some(v=>!Number.isFinite(Number(v.base_stat))||Number(v.base_stat)<=0))throw Error(`Incomplete stats ${row.id}`);
 const gameCorrection=formAudit.gameStatsConflicts.find(correction=>correction.id===mon.id);
 bst[mon.id]=gameCorrection?Object.values(gameCorrection.gameStats).reduce((sum,value)=>sum+value,0):values.reduce((sum,v)=>sum+Number(v.base_stat),0);inventory.push({id:mon.id,name:mon.name,sourceId:Number(row.id),identifier:row.identifier,speciesId,bst:bst[mon.id],...(cosmeticGenderIds.has(mon.id)?{mapping:'Cosmetic female sprite uses species personal record'}:{}),...(borrowedRecords.has(mon.id)?{mapping:'Appearance without its own record uses the record it is drawn from'}:{}),...(gameCorrection?{gameCorrection:'Direct ZA personal record; see form-metadata-audit/provenance.json'}:{})});
}
writeFileSync('src/favorites/data/formBst.json',JSON.stringify(bst,null,2)+'\n');
writeFileSync('docs/favorite-picker-work/conditional-stats/bst-provenance.json',JSON.stringify({repository:'https://github.com/PokeAPI/pokeapi',revision,sources:[pokemon,forms,stats].map(({name,sha256})=>({name,sha256,url:`https://raw.githubusercontent.com/PokeAPI/pokeapi/${revision}/data/v2/csv/${name}.csv`})),inventory,unknown},null,2)+'\n');
console.log(`${inventory.length} sourced BST entries; ${unknown.length} explicitly unknown.`);
