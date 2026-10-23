import {describe,it,expect} from 'vitest';
import {parseAttentionPayload,mergeAttention,parseAttentionRecording,attentionSessionCount} from '../../api/_attention';
import {buildDashboard} from '../../api/_dashboard';
const start=Date.UTC(2026,9,5), minute=60_000;
const segment=(id:string,a:number,b:number)=>({id,start:start+a*minute,end:start+b*minute});
const payload=(...segments:ReturnType<typeof segment>[])=>({v:1 as const,segments});

describe('foreground interaction ingestion',()=>{
 it('rejects oversized, future, backward, duplicate-ID and malformed intervals without accepting fabricated time',()=>{
  const now=start+60*minute;
  for(const value of [{v:2,segments:[]},{v:1,segments:[segment('valid-id',5,4)]},{v:1,segments:[segment('valid-id',0,70)]},payload(segment('duplicate-id',0,1),segment('duplicate-id',1,2)),payload(...Array.from({length:51},(_,i)=>segment(`segment-${i}`,i,i+1))),{v:1,segments:[{id:'x',start,end:start}]}])expect(parseAttentionPayload(value,now)).toBeNull();
  expect(parseAttentionPayload(payload(segment('valid-id',0,1500)),start+1600*minute)).toBeNull();
  expect(parseAttentionPayload(payload(segment('valid-id',0,1)),now)).not.toBeNull();
 });
 it('accepts retries and delayed shorter snapshots without changing active time, then accepts a real extension',()=>{
  const first=mergeAttention(undefined,payload(segment('session-001',0,1)),start+minute)!;
  expect(first.totalMs).toBe(minute);
  expect(mergeAttention(first,payload(segment('session-001',0,1)),start+2*minute)?.totalMs).toBe(minute);
  expect(mergeAttention(first,payload(segment('session-001',0,0)),start+2*minute)?.totalMs).toBe(minute);
  const extended=mergeAttention(first,payload(segment('session-001',0,2)),start+2*minute)!;
  expect(extended.totalMs).toBe(2*minute);
  expect(mergeAttention(extended,undefined,start+3*minute)).toEqual(extended);
  expect(first.totalMs).toBe(minute);
 });
 it('unions overlapping tabs and keeps exact five-minute session boundaries separate',()=>{
  const record=mergeAttention(undefined,payload(segment('tab-one-001',0,10),segment('tab-two-001',5,15)),start+15*minute)!;
  expect(record.totalMs).toBe(15*minute);
  expect(attentionSessionCount([segment('session-001',0,1),segment('session-002',6,7)])).toBe(2);
  expect(attentionSessionCount([segment('session-001',0,1),segment('session-002',4,5),segment('session-003',8,9)])).toBe(1);
 });
 it('keeps measured checkpoints after trimming and ignores expired replay IDs',()=>{
  let record=mergeAttention(undefined,payload(segment('session-000',0,1)),start+minute)!;
  for(let i=1;i<70;i++)record=mergeAttention(record,payload(segment(`session-${String(i).padStart(3,'0')}`,i*10,i*10+1)),start+(i*10+1)*minute)!;
  expect(record.segments).toHaveLength(50);expect(record.totalMs).toBe(70*minute);
  expect(record.retiredThrough).toBe(start+191*minute);
  expect(mergeAttention(record,payload(segment('session-000',0,1)),start+700*minute)?.totalMs).toBe(70*minute);
  expect(parseAttentionRecording(record)).toEqual(record);
 });
 it('clips future clock skew rather than counting minutes before server time reaches them',()=>{
  const first=mergeAttention(undefined,payload(segment('session-001',0,5)),start+minute)!;
  expect(first.totalMs).toBe(minute);
  expect(mergeAttention(first,payload(segment('session-001',0,5)),start+2*minute)?.totalMs).toBe(2*minute);
 });
 it('does not turn historical legacy spans into measured activity; new Suite weekly totals equal unioned activity',()=>{
  const attention=mergeAttention(undefined,payload(segment('session-001',0,1),segment('session-002',6,7)),start+7*minute)!;
  const legacy={cid:'browser-0001',firstTs:start,lastTs:start+30*minute,firstAt:new Date(start).toISOString(),lastAt:new Date(start+30*minute).toISOString(),submits:2,sessions:1,sessionMs:[30*minute],sessionLog:[{ts:start+30*minute,ids:[1]}],maxDepth:1,localHour:12,everIds:[1],latestIds:[1],completed:false,exported:false};
  const source={clients:{'browser-0001':JSON.stringify({...legacy,attention})},archived:[],funnel:{},funnelWindow:null,leagueClients:{}};
  const response=buildDashboard(source,{range:'all'},start+60*minute);
  expect(response.recordedUsage.all.time.total).toBe(30*minute);
  expect(response.attentionUsage.all.time.total).toBe(2*minute);
  expect(response.attentionUsage.all.sessions.total).toBe(2);
  expect(response.attentionUsage.all.weekly!.reduce((sum,w)=>sum+w.totalMs,0)).toBe(2*minute);
  const old=buildDashboard({...source,clients:{'browser-0001':JSON.stringify(legacy)}},{range:'all'},start+60*minute);
  expect(old.attentionUsage.all.time.n).toBe(0);
  expect(old.attentionUsage.all.missingTime).toBe(1);
  expect(old.attentionUsage.all.missingSessions).toBe(1);
  expect(old.recordedUsage.all.time.total).toBe(30*minute);
  const selected=buildDashboard({...source,clients:{'browser-0001':JSON.stringify({...legacy,lastTs:start+2*86_400_000,attention})}},{range:'24h'},start+2*86_400_000);
  expect(selected.attentionUsage.all.time.n).toBe(0);
  expect(selected.attentionUsage.all.missingTime).toBe(1);
  expect(selected.attentionUsage.all.missingSessions).toBe(1);
 });
});
