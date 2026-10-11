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
  expect(calls.every(c=>Number(c.args[2])>=72)).toBe(true);
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
  const db={eval:async()=>[],hgetall:async()=>null,hscan:async()=>[0,pairs] as [number,unknown[]]};
  const result=await loadMinuteActivityHistory(now,now+1000,{db});
  expect(result).toMatchObject({truncated:true,cursorDay:'2026-10-11'});
  expect(result).toMatchObject({blockedPage:true});
  expect(result.nextCursor).toBeUndefined();
 });
});

describe('budget guardrails',()=>{
 it('cannot enlarge the designed allowance through environment overrides',async()=>{
  const db={eval:async()=>[],hgetall:async()=>null,hscan:async()=>[0,[]] as [number,unknown[]]};
  const budget=await readMinuteActivityBudget(now,{db,env:{MINUTE_ACTIVITY_MONTHLY_UNITS:'9000000',MINUTE_ACTIVITY_MONTHLY_BYTES:'999999999'}});
  expect(budget).toMatchObject({limitUnits:2000000,limitBytes:16777216});
 });
 it('keeps a stopped month paused and starts a fresh allowance next month',async()=>{
  const db={eval:async()=>[],hgetall:async(key:string)=>key.endsWith('2026-10')?{paused:'1',units:'100',bytes:'0'}:null,hscan:async()=>[0,[]] as [number,unknown[]]};
  expect(await readMinuteActivityBudget(now,{db})).toMatchObject({status:'paused',pausedUntil:Date.UTC(2026,10,1)});
  expect(await readMinuteActivityBudget(Date.UTC(2026,10,1),{db})).toMatchObject({status:'collecting',usedUnits:0});
 });
});

describe('history cursor boundaries',()=>{
 it('resumes a whole page and never uses offsets in a page that can change',async()=>{
  const pairs=(count:number)=>Array.from({length:count},()=>['field','invalid']).flat();
  const db={eval:async()=>[],hgetall:async()=>null,hscan:async(_key:string,cursor:number)=>[cursor===0?17:0,pairs(cursor===0?1500:600)] as [number,unknown[]]};
  const first=await loadMinuteActivityHistory(now,now+1000,{db});
  expect(first.truncated).toBe(true);
  expect(JSON.parse(Buffer.from(first.nextCursor!,'base64url').toString())).toEqual({day:'2026-10-11',cursor:17});
  expect((await loadMinuteActivityHistory(now,now+1000,{db,cursor:first.nextCursor})).truncated).toBe(false);
 });
 it('rejects malformed calendar dates instead of silently returning empty history',async()=>{
  const db={eval:async()=>[],hgetall:async()=>null,hscan:async()=>[0,[]] as [number,unknown[]]};
  const cursor=Buffer.from(JSON.stringify({day:'2026-02-30',cursor:0})).toString('base64url');
  await expect(loadMinuteActivityHistory(Date.UTC(2026,1,1),Date.UTC(2026,2,1),{db,cursor})).rejects.toThrow('Invalid history cursor');
 });
});
