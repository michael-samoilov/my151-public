import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import type {VercelRequest, VercelResponse} from '@vercel/node';
import {recordRedisCommands} from './recordRedisCommands';
import type {ClientRecord} from '../../api/_shared';
let dexHandler: (req: VercelRequest,res: VercelResponse)=>Promise<unknown>;
let leagueHandler: typeof dexHandler;
let favoriteHandler: typeof dexHandler;
const start = Date.UTC(2026,9,10);
const minute = 60_000;
beforeAll(async()=>{
  process.env.UPSTASH_REDIS_REST_URL ||= 'https://example.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN ||= 'test-token';
  ({default:dexHandler}=await import('../../api/submit'));
  ({default:leagueHandler}=await import('../../api/league'));
  ({default:favoriteHandler}=await import('../../api/favorites'));
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.unstubAllEnvs();});
const isWrite = (cmd: string[]) => cmd[0].toLowerCase()==='eval' && [2,6].includes(Number(cmd[2]));
async function send(handler: typeof dexHandler, body: Record<string,unknown>, stored: Record<string,unknown>, headers: Record<string,string> = {}, race=false, receivedAt=start+20*minute) {
  vi.spyOn(Date,'now').mockReturnValue(receivedAt);
  let attempts=0;
  const commands=recordRedisCommands(cmd=>{
    if(cmd[0].toLowerCase()==='hget') return cmd[1].endsWith(':ver') ? null : stored[cmd[2]] ?? null;
    if(isWrite(cmd)) return race && ++attempts===1 ? 0 : 1;
    if(cmd[0].toLowerCase()==='evalsha'||cmd[0].toLowerCase()==='eval') return [100,start+60*minute];
    return 1;
  });
  let status=0;
  const res={status:(n:number)=>{status=n;return {json:()=>undefined};},setHeader:()=>undefined} as unknown as VercelResponse;
  await handler({method:'POST',body,headers} as unknown as VercelRequest,res);
  const writes=commands.filter(isWrite);
  return {status,commands,writes,records:writes.map(cmd=>JSON.parse(cmd[3+Number(cmd[2])+2]) as ClientRecord)};
}

describe('attention uses existing ingestion',()=>{
 it('stores valid intervals for all tools, rejects invalid intervals before Redis, and preserves them for legacy clients',async()=>{
  const attention={v:1,segments:[{id:'segment-valid',start,end:start+minute}]};
  for(const handler of [dexHandler,leagueHandler,favoriteHandler]){
   const body={cid:'attention-browser',kind:'progress',id:'attention-request',snapshot:{v:1,fills:{'water|1':7}},ids:[1],summary:{cards:1,seats:1,typed:0,named:0,aces:0},ts:start+20*minute};
   const first=await send(handler,{...body,attention},{});
   expect(first.status).toBe(200);expect(first.records[0].attention?.totalMs).toBe(minute);
   const original=first.records[0];
   const stored={'attention-browser':JSON.stringify(original)};
   const baseline=await send(handler,{...body,id:'attention-request-baseline'},stored);
   const skew=await send(handler,{...body,id:'attention-request-skew',attention:{v:1,segments:[{id:'segment-future',start:start+80*minute,end:start+81*minute}]}},stored);
   expect(skew.status).toBe(200);expect(skew.records[0].attention).toEqual(original.attention);
   expect(skew.commands.map(c=>c[0].toLowerCase())).toEqual(baseline.commands.map(c=>c[0].toLowerCase()));
   const valid=await send(handler,{...body,id:'attention-request-valid',attention},stored);
   expect(valid.commands.map(c=>c[0].toLowerCase())).toEqual(baseline.commands.map(c=>c[0].toLowerCase()));
   const legacy=await send(handler,{...body,id:'attention-request-legacy'},{'attention-browser':JSON.stringify(original)});
   expect(legacy.records[0].attention).toEqual(original.attention);
   const retry=await send(handler,{...body,attention},{'attention-browser':JSON.stringify(original)}, {},true);
   expect(retry.records[0].attention?.totalMs).toBe(minute);
   const invalid=await send(handler,{...body,attention:{v:1,segments:[{id:'segment-valid',start,end:start-1}]}},{});
   expect(invalid.status).toBe(400);expect(invalid.commands).toEqual([]);
  }
 });
});

describe('seen days use existing ingestion',()=>{
 it('stores valid seen days for all tools, drops bad entries without rejecting the beacon, and keeps 400 days',async()=>{
  const day=86_400_000;
  for(const handler of [dexHandler,leagueHandler,favoriteHandler]){
   const body={cid:'seen-browser',kind:'progress',id:'seen-request',snapshot:{v:1,fills:{'water|1':7}},ids:[1],summary:{cards:1,seats:1,typed:0,named:0,aces:0},ts:start+20*minute};
   const first=await send(handler,{...body,seen:[start,start,start+day,start+5,Date.UTC(2023,11,31),'x',null]},{});
   expect(first.status).toBe(200);expect(first.records[0].seenDays).toEqual([start]);
   const stored={'seen-browser':JSON.stringify({...first.records[0],seenDays:[start-400*day,start-399*day,start-100*day,start-day]})};
   const merged=await send(handler,{...body,id:'seen-request-later',seen:[start]},stored);
   expect(merged.records[0].seenDays).toEqual([start-399*day,start-100*day,start-day,start]);
   const tooMany=await send(handler,{...body,id:'seen-request-many',seen:Array.from({length:9},(_,i)=>start-i*day)},{});
   expect(tooMany.status).toBe(200);expect(tooMany.records[0].seenDays).toBeUndefined();
  }
 });
});
