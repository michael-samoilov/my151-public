import { allPickerMons } from '../model/catalog';
import { pickerEvolutionRole, pickerPokemonMetadata } from '../model/metadata';
import { eligibleFor } from '../model/eligibility';
import type { FavoritesExportCell, FavoritesSnapshot } from '../export/snapshot';
import { computeConditionalStats } from './conditionalStats';
import type { StatsBst } from '@/components/view/useDetailedStatsData';
const sourcedBst=Object.fromEntries(allPickerMons().map(mon=>[mon.id,pickerPokemonMetadata(mon)?.bst])) as Record<number,number>;
const entries=allPickerMons().map(mon=>{
 const data=pickerPokemonMetadata(mon);
 const evolution=pickerEvolutionRole(mon);
 const bst=sourcedBst[mon.id];
 return {id:mon.id,attributes:{type:mon.types,shape:data?.shape?[data.shape]:undefined,color:data?.color?[data.color]:undefined,evolution:evolution?[evolution]:undefined,bst:Number.isFinite(bst)?[String(Math.floor(bst/50)*50)]:undefined}};
});
function pickerBstSelectorEligible(cell: FavoritesExportCell) {
 return cell.type !== 'starter' && cell.type !== 'legendary' && cell.type !== 'gimmick'
  && cell.generation !== 'legendary' && cell.generation !== 'gimmick';
}
function selectedPools(snapshot:FavoritesSnapshot,dimension?:string){
 return snapshot.cells.filter(cell=>cell.kind==='pick'&&cell.mon&&(dimension!=='bst'||pickerBstSelectorEligible(cell))).map(cell=>({cell,id:cell.mon!.id,pool:eligibleFor(cell.type,cell.generation).map(mon=>mon.id)}));
}
export function pickerConditionalContributors(snapshot:FavoritesSnapshot,dimension:string,key:string){
 const byId=new Map(entries.map(entry=>[entry.id,entry.attributes as Record<string,readonly string[]|undefined>]));
 return selectedPools(snapshot,dimension).filter(pick=>pick.pool.length>1&&pick.pool.includes(pick.id)&&pick.pool.every(id=>byId.get(id)?.[dimension]?.length)&&byId.get(pick.id)?.[dimension]?.includes(key)).map(pick=>pick.cell);
}
export function pickerConditionalStats(snapshot:FavoritesSnapshot){
 const picks=selectedPools(snapshot);
 const bstPicks=selectedPools(snapshot,'bst');
 const result=computeConditionalStats(entries,picks,['type','color','shape','evolution','bst']);
 result.dimensions.bst=computeConditionalStats(entries,bstPicks,['bst']).dimensions.bst;
 for(const name of ['type','color','shape','evolution']){
  const dimension=result.dimensions[name],present=new Set(dimension.rows.map(row=>row.key));
  for(const key of new Set(entries.flatMap(entry=>(entry.attributes as Record<string,readonly string[]|undefined>)[name]??[])))
   if(!present.has(key))dimension.rows.push({key,count:0,expected:0,deviation:null});
 }
 const dimension=result.dimensions.bst,denominator=dimension.coveredChoices;
 const merged=dimension.rows.filter(row=>row.expected>0).map(row=>({x:Number(row.key)+25,nationalPct:denominator?row.expected/denominator*100:0,yoursPct:denominator?row.count/denominator*100:0})).sort((a,b)=>a.x-b.x);
 const low=Math.floor((merged[0]?.x??0)/100)*100;
 const selectedHigh=Math.max(0,...merged.filter(row=>row.yoursPct>0).map(row=>row.x+25));
 const high=merged.length?Math.max(800,selectedHigh):100;
 const yDomain=Math.max(10,Math.ceil(Math.max(0,...merged.flatMap(row=>[row.nationalPct,row.yoursPct]))/10)*10);
 const covered=bstPicks.map(pick=>({...pick,pool:[...new Set(pick.pool)]})).filter(pick=>pick.pool.length>1&&pick.pool.includes(pick.id)&&pick.pool.every(id=>Number.isFinite(sourcedBst[id])));
 const yoursAvg=covered.length?covered.reduce((sum,pick)=>sum+sourcedBst[pick.id],0)/covered.length:0;
 const nationalAvg=covered.length?covered.reduce((sum,pick)=>sum+pick.pool.reduce((n,id)=>n+sourcedBst[id],0)/pick.pool.length,0)/covered.length:0;
 const bst:StatsBst={merged,binSize:50,xDomain:[low,high],xTicks:Array.from({length:Math.floor((high-low)/100)+1},(_,i)=>low+i*100),yDomain,yTicks:Array.from({length:yDomain/10+1},(_,i)=>i*10),yoursAvg,nationalAvg};
 const bstEligibleTotal=snapshot.cells.filter(cell=>cell.kind==='pick'&&pickerBstSelectorEligible(cell)).filter(cell=>{
  const pool=[...new Set(eligibleFor(cell.type,cell.generation).map(mon=>mon.id))];
  return pool.length>1&&pool.every(id=>Number.isFinite(sourcedBst[id]));
 }).length;
 return {...result,bst,incomplete:covered.length<bstEligibleTotal};
}
export type PickerConditionalStats=ReturnType<typeof pickerConditionalStats>;
