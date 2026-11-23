import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import type {VercelRequest, VercelResponse} from '../../api/_vercel';
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
const record = (cid: string,ids=[1],country='US'): ClientRecord => ({cid,firstTs:start,firstAt:new Date(start).toISOString(),lastTs:start+10*minute,
  lastAt:new Date(start+10*minute).toISOString(),submits:2,sessions:1,sessionMs:[10*minute],sessionLog:[{ts:start+10*minute,ids}],
  maxDepth:1,localHour:0,everIds:ids,latestIds:ids,completed:false,exported:false,country});
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

describe('checkpoints use the existing atomic write',()=>{
  it('records Dex checkpoints in six commands and keeps one record when the country changes',async()=>{
    const cid='checkpoint-browser';
    const sent=await send(dexHandler,{cid,kind:'progress',ids:[7],ts:start+20*minute},
      {[cid]:JSON.stringify(record(cid))},{'x-vercel-ip-country':'JP'});
    expect(sent.status).toBe(200);
    expect(sent.commands.map(c=>c[0].toLowerCase())).toEqual(['evalsha','evalsha','hget','hget','eval','eval']);
    expect(sent.records[0]).toMatchObject({cid,country:'JP',recording:{v:1,totalMs:20*minute,checkpointFrom:start+20*minute}});
    expect(sent.records[0].activityCoverageFrom).toBe(start+20*minute);
  });
  it('does not seed a synthesized legacy first-to-last span, including a CAS retry',async()=>{
    const cid='checkpoint-legacy';
    const legacy={...record(cid),firstTs:start-100*86_400_000,sessions:undefined,sessionLog:undefined,sessionMs:undefined};
    const sent=await send(dexHandler,{cid,kind:'progress',ids:[1],ts:start+20*minute},{[cid]:JSON.stringify(legacy)},{},true);
    expect(sent.status).toBe(200);
    expect(sent.records).toHaveLength(2);
    expect(sent.records[0].recording?.totalMs).toBe(0);
    expect(sent.records[1]).toEqual(sent.records[0]);
  });
  it('records League metadata in the same five commands',async()=>{
    const cid='checkpoint-league';
    const existing={...record(cid),maxCards:1,maxSeats:1,maxSessionMs:10*minute,curSessionStart:start,
      latest:{cards:1,seats:1,typed:0,named:0,aces:0,leagueNamed:false},exportsCard:0,exportsLeague:0};
    const sent=await send(leagueHandler,{cid,kind:'progress',summary:existing.latest,ts:start+20*minute},{[cid]:JSON.stringify(existing)});
    expect(sent.status).toBe(200);
    expect(sent.commands.map(c=>c[0].toLowerCase())).toEqual(['evalsha','evalsha','hget','hget','eval']);
    expect(sent.records[0].recording?.totalMs).toBe(20*minute);
  });
  it('counts a Dex span before eviction and skips replays near the retired visit',async()=>{
    const cid='checkpoint-dex-cap';
    const existing={...record(cid),sessions:50,recording:{v:1,coverageFrom:start-49*60*minute,checkpointFrom:start-49*60*minute,totalMs:500*minute,asOf:start+10*minute},
      sessionMs:Array(50).fill(10*minute),sessionLog:Array.from({length:50},(_,i)=>({ts:start+(i-49)*60*minute+10*minute,ids:[1]}))};
    const first=await send(dexHandler,{cid,kind:'progress',ids:[1],ts:start+50*minute},{[cid]:JSON.stringify(existing)},{},false,start+50*minute);
    expect(first.status).toBe(200);
    expect(first.records[0].sessions).toBe(51);
    expect(first.records[0].sessionLog).toHaveLength(50);
    expect(first.records[0].sessionMs!.reduce((a,b)=>a+b,0)).toBe(490*minute);
    expect(first.records[0].recording?.totalMs).toBe(500*minute);
    const extended=await send(dexHandler,{cid,kind:'progress',ids:[1],ts:start+60*minute},{[cid]:JSON.stringify(first.records[0])},{},false,start+60*minute);
    expect(extended.records[0].recording?.totalMs).toBe(510*minute);
    for(const ts of [existing.sessionLog[0].ts,existing.sessionLog[0].ts+minute,existing.sessionLog[0].ts+30*minute]) {
      const replay=await send(dexHandler,{cid,kind:'progress',ids:[1],ts},{[cid]:JSON.stringify(extended.records[0])},{},false,start+60*minute);
      expect(replay.records[0].sessions).toBe(51);
      expect(replay.records[0].recording?.totalMs).toBe(510*minute);
    }
  });
  it('records Picker checkpoints in the same five commands',async()=>{
    const cid='checkpoint-picker';
    const snapshot={v:1,fills:{},filled:0,picksFilled:0,pointersFilled:0,uniqueIds:[]};
    const existing={v:1,cid,firstTs:start,lastTs:start+10*minute,firstAt:new Date(start).toISOString(),lastAt:new Date(start+10*minute).toISOString(),
      submits:2,sessions:1,curSessionStart:start,maxSessionMs:10*minute,sessionMs:[10*minute],
      sessionLog:[{id:'request-old',ts:start,endTs:start+10*minute,snapshot,events:['favorites-open']}],latest:snapshot,maxFilled:0,exportsFull:0,exportsSimplified:0,seenIds:['request-old']};
    const sent=await send(favoriteHandler,{cid,id:'request-checkpoint',kind:'progress',snapshot:{v:1,fills:{}},ts:start+20*minute},{[cid]:JSON.stringify(existing)});
    expect(sent.status).toBe(200);
    expect(sent.commands.map(c=>c[0].toLowerCase())).toEqual(['evalsha','evalsha','hget','hget','eval']);
    expect(sent.records[0].recording?.totalMs).toBe(20*minute);
  });
  it('uses first server receipt for a new League record with same-day future client skew',async()=>{
    const sent=await send(leagueHandler,{cid:'checkpoint-newborn',kind:'progress',summary:{cards:1,seats:1,typed:0,named:0,aces:0},ts:start+21*minute},{});
    expect(sent.status).toBe(200);
    expect(sent.records[0]).toMatchObject({firstTs:start+21*minute,activityCoverageFrom:start+20*minute,activeDays:[start],recording:{coverageFrom:start+20*minute,checkpointFrom:start+20*minute,totalMs:0}});
  });
  it('keeps owner and preview progress requests out of every analytics store',async()=>{
    for(const handler of [dexHandler,leagueHandler,favoriteHandler]) {
      for(const preview of [false,true]) {
        vi.stubEnv('VERCEL_ENV',preview?'preview':'production');
        const sent=await send(handler,{cid:'checkpoint-optout',kind:'progress',id:'request-optout',snapshot:{v:1,fills:{}},ids:[1],summary:{cards:1,seats:1,typed:0,named:0,aces:0},notme:!preview,ts:start}, {},{host:preview?'preview.vercel.app':'my151.app'});
        expect(sent.status).toBe(200);
        expect(sent.commands).toEqual([]);
      }
    }
  });
});
