import cellData from '../../api/_favoriteCells.json';
import { describe, expect, it } from 'vitest';
import { parseFavoriteSnapshot, mergeFavoriteRecord, parseFavoriteRecord } from '../../api/_favoriteRecord';
const snapshot = () => parseFavoriteSnapshot({v:1,fills:{'water|1':7,'favorite|1':7}})!;
const input = (id:string,now=1_000_000) => ({cid:'browser-0001',id,kind:'progress' as const,now,snapshot:snapshot(),events:[]});
describe('favorite record failure guards',()=>{
 it('normalizes stored snapshots and rejects nonfinite or negative counters',()=>{
  const r=mergeFavoriteRecord(null,input('first-000001'));
  expect(parseFavoriteRecord({...r,exportsFull:NaN})).toBeNull();
  expect(parseFavoriteRecord({...r,firstTs:1e20,lastTs:1e20})).toBeNull();
  expect(parseFavoriteRecord({...r,maxFilled:-1})).toBeNull();
  expect(parseFavoriteRecord({...r,latest:{...r.latest,filled:257}})!.latest.filled).toBe(2);
  expect(parseFavoriteRecord({...r,sessionLog:[{...r.sessionLog[0],endTs:NaN}]} )!.sessionLog).toEqual([]);
 });
 it('rejects unknown snapshot versions and discards forged totals, invalid picks, and orphaned pointers',()=>{
  expect(parseFavoriteSnapshot({v:2,fills:{}})).toBeNull();
  const s=parseFavoriteSnapshot({v:1,filled:257,fills:{'water|1':7,'fire|1':7,'favorite|1':4,'Bad|1':25}})!;
  expect(s.filled).toBe(1);expect(s.fills).toEqual({'water|1':7});
 });
 it('keeps a shiny pick only while its cell holds that Pokémon, and adds no field when nothing is shiny',()=>{
  const s=parseFavoriteSnapshot({v:1,fills:{'water|1':7,'fire|1':4,'favorite|1':7},shiny:{'water|1':7,'fire|1':5,'favorite|1':7,'Bad|1':7,'grass|1':1}})!;
  expect(s.shiny).toEqual({'water|1':7});
  expect(snapshot()).not.toHaveProperty('shiny');
  const r=mergeFavoriteRecord(null,{...input('shiny-000001'),snapshot:s});
  expect(parseFavoriteRecord(JSON.stringify(r))!.latest.shiny).toEqual({'water|1':7});
 });
 it('counts valid pick and pointer cells without counting pointer votes twice',()=>{
  expect(snapshot()).toMatchObject({filled:2,picksFilled:1,pointersFilled:1,uniqueIds:[7]});
 });
 it('does not double-count a retried export',()=>{
  const i={...input('export-00001'),kind:'export' as const,exportKind:'full' as const};
  const r=mergeFavoriteRecord(null,i);expect(mergeFavoriteRecord(r,i)).toEqual(r);expect(r.exportsFull).toBe(1);
 });
 it('keeps the current board when an older request arrives',()=>{
  let r=mergeFavoriteRecord(null,input('first-000001'));
  r=mergeFavoriteRecord(r,{...input('newer-000001',1_010_000),snapshot:parseFavoriteSnapshot({v:1,fills:{}})!});
  r=mergeFavoriteRecord(r,input('older-000001',1_005_000));expect(r.latest.filled).toBe(0);expect(r.lastTs).toBe(1_010_000);
 });
 it('attaches a delayed first request to the same sitting instead of inventing another visit',()=>{
  const r=mergeFavoriteRecord(mergeFavoriteRecord(null,input('newer-000001',1_010_000)),input('older-000001',1_000_000));
  expect(r.sessions).toBe(1);expect(r.sessionLog[0].ts).toBe(1_000_000);expect(r.sessionMs).toEqual([10_000]);
 });
 it('counts all 257 eligible cells only when every pointer has a valid source',()=>{
  const fills:Record<string,number>={};
  for(const [key,cell] of Object.entries(cellData) as [string,{kind:string;ids?:number[];sources?:string[]}][]) {
   if(cell.kind==='pick')fills[key]=cell.ids![0];
  }
  for(const [key,cell] of Object.entries(cellData) as [string,{kind:string;ids?:number[];sources?:string[]}][]) {
   if(cell.kind==='pointer')fills[key]=fills[cell.sources!.find(source=>fills[source])!];
  }
  expect(parseFavoriteSnapshot({v:1,fills})!.filled).toBe(257);
 });
 it('creates a new sitting after 30 minutes and retains the old board',()=>{
  const r=mergeFavoriteRecord(mergeFavoriteRecord(null,input('first-000001')),input('later-000001',3_000_001));
  expect(r.sessions).toBe(2);expect(r.sessionLog).toHaveLength(2);
 });
});
