import pokemonData from '@/data/pokemon.json';
import formBst from '../data/formBst.json';
import { allPickerMons, pickerDexId } from '../model/catalog';
import { eligibleFor } from '../model/eligibility';
import type { FavoritesSnapshot } from '../export/snapshot';
import { computeConditionalStats } from './conditionalStats';
import type { StatsBst } from '@/components/view/useDetailedStatsData';
const metadata=new Map(pokemonData.map(mon=>[mon.id,mon]));
const parents=new Set(pokemonData.flatMap(mon=>mon.evolvesFrom==null?[]:[mon.evolvesFrom]));
const sourcedBst=formBst as Record<number,number>;
const entries=allPickerMons().map(mon=>{
 const data=metadata.get(pickerDexId(mon));
 // Roles, not exact numbered stages: a baby is Basic; Final includes two-stage lines.
 const evolution=!data?undefined:data.isBaby?'basic':data.evolvesFrom==null?(parents.has(data.id)?'basic':'standalone'):parents.has(data.id)?'intermediate':'final';
 const bst=sourcedBst[mon.id];
 return {id:mon.id,attributes:{type:mon.types,shape:data?.shape?[data.shape]:undefined,color:data?.color?[data.color]:undefined,evolution:evolution?[evolution]:undefined,bst:Number.isFinite(bst)?[String(Math.floor(bst/50)*50)]:undefined}};
});
/** Baseline is uniform over each occupied selector's actual distinct options, never a National Dex comparison. */
export function pickerConditionalStats(snapshot:FavoritesSnapshot){
 const picks=snapshot.cells.filter(cell=>cell.kind==='pick'&&cell.mon).map(cell=>({id:cell.mon!.id,pool:eligibleFor(cell.type,cell.generation).map(mon=>mon.id)}));
 const result=computeConditionalStats(entries,picks,['type','color','shape','evolution','bst']);
 const dimension=result.dimensions.bst,denominator=dimension.coveredChoices;
 const merged=dimension.rows.map(row=>({x:Number(row.key)+25,nationalPct:denominator?row.expected/denominator*100:0,yoursPct:denominator?row.count/denominator*100:0})).sort((a,b)=>a.x-b.x);
 const low=Math.floor((merged[0]?.x??0)/100)*100,high=merged.length?(merged.at(-1)!.x+25):100;
 const yDomain=Math.max(10,Math.ceil(Math.max(0,...merged.flatMap(row=>[row.nationalPct,row.yoursPct]))/10)*10);
 // nationalPct is only the shared Dex painter's structural field name; the displayed legend says Selector options.
 const covered=picks.map(pick=>({...pick,pool:[...new Set(pick.pool)]})).filter(pick=>pick.pool.length>1&&pick.pool.includes(pick.id)&&pick.pool.every(id=>Number.isFinite(sourcedBst[id])));
 const yoursAvg=covered.length?covered.reduce((sum,pick)=>sum+sourcedBst[pick.id],0)/covered.length:0;
 const nationalAvg=covered.length?covered.reduce((sum,pick)=>sum+pick.pool.reduce((n,id)=>n+sourcedBst[id],0)/pick.pool.length,0)/covered.length:0;
 const bst:StatsBst={merged,binSize:50,xDomain:[low,high],xTicks:Array.from({length:Math.floor((high-low)/100)+1},(_,i)=>low+i*100),yDomain,yTicks:Array.from({length:yDomain/10+1},(_,i)=>i*10),yoursAvg,nationalAvg};
 return {...result,bst};
}
export type PickerConditionalStats=ReturnType<typeof pickerConditionalStats>;
