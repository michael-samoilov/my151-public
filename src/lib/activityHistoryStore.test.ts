// keeps: E2E stubs Redis, hiding optional-history failures and budget isolation.
import {describe,it,expect} from 'vitest';
import {appendMinuteActivity,readMinuteActivityBudget,loadMinuteActivityHistory,ACTIVITY_APPEND_SCRIPT} from '../../api/_activityHistoryStore';
const now=Date.UTC(2026,9,11), raw={v:1,batches:[{id:'batch-0001',tab:'tab-00001',day:'2026-10-11',buckets:[{run:'run-00001',first:now,last:now}]}]};
describe('optional detail storage isolation',()=>{
 it('never touches Redis for malformed or disabled history',async()=>{
  const db={eval:async()=>{throw Error('unexpected');},hgetall:async()=>null,hscan:async()=>[0,[]] as [number,string[]]};
  expect(await appendMinuteActivity('browser-1','dex',{},now,{db})).toEqual({accepted:[],status:'invalid'});
  expect(await appendMinuteActivity('browser-1','dex',raw,now,{db,env:{MINUTE_ACTIVITY_ENABLED:'0'}})).toMatchObject({status:'disabled',accepted:[]});
 });
 it('does not fail a valid build when Redis history is unavailable',async()=>{
  const db={eval:async()=>{throw Error('unavailable');},hgetall:async()=>null,hscan:async()=>[0,[]] as [number,string[]]};
  expect(await appendMinuteActivity('browser-1','dex',raw,now,{db})).toEqual({accepted:[],status:'paused',retryAt:now+60_000});
 });
 it('uses one shared monthly atomic allowance and capture-day expiry for every tool',async()=>{
  const calls:{keys:string[];args:(string|number)[]}[]=[];
  const db={eval:async(_script:string,keys:string[],args:(string|number)[])=>{calls.push({keys,args});return ['recorded','batch-0001'];},hgetall:async()=>null,hscan:async()=>[0,[]] as [number,string[]]};
  for(const tool of ['dex','league','favorites'] as const)expect(await appendMinuteActivity('browser-1',tool,raw,now,{db})).toMatchObject({status:'recorded',accepted:['batch-0001']});
  expect(new Set(calls.map(c=>c.keys[0])).size).toBe(1);
  expect(calls.every(c=>Number(c.args[2])>=40)).toBe(true);
  expect(calls.every(c=>Number(c.args[7])===now/1000+400*86400)).toBe(true);
  expect(ACTIVITY_APPEND_SCRIPT).toContain('redis.call');
 });
 it('reports allowance exhaustion without claiming measured dollars',async()=>{
  const db={eval:async()=>[],hgetall:async()=>({units:'2000000',bytes:'123',buckets:'7'}),hscan:async()=>[0,[]] as [number,string[]]};
  expect(await readMinuteActivityBudget(now,{db})).toMatchObject({status:'paused',usedUnits:2000000,bytes:123,acceptedBuckets:7});
 });
});

describe('bounded history reads',()=>{
 it('filters tools and browsers, rejects malformed stored data and clips the requested endpoints',async()=>{
  const b={...raw.batches[0],cid:'browser-1',tool:'dex',buckets:[{run:'run-00001',first:now,last:now+59000}]};
  const db={eval:async()=>[],hgetall:async()=>null,hscan:async()=>[0,['good',JSON.stringify(b),'other',JSON.stringify({...b,cid:'browser-2'}),'bad',JSON.stringify({...b,day:'2026-10-10'})]] as [number,unknown[]]};
  const result=await loadMinuteActivityHistory(now+10000,now+20000,{db,cid:'browser-1',tool:'dex'});
  expect(result.batches).toHaveLength(1);
  expect(result.batches[0].buckets[0]).toMatchObject({first:now+10000,last:now+20000});
  expect(result.truncated).toBe(false);
  await expect(loadMinuteActivityHistory(now,now+32*86400000,{db})).rejects.toThrow();
 });
 it('marks pagination incomplete rather than returning an unlimited daily hash',async()=>{
  const pairs=Array.from({length:2001},()=>['field','invalid']).flat();
  const db={eval:async()=>[],hgetall:async()=>null,hscan:async()=>[1,pairs] as [number,unknown[]]};
  const result=await loadMinuteActivityHistory(now,now+1000,{db});
  expect(result).toMatchObject({truncated:true,cursorDay:'2026-10-11'});
 });
});
