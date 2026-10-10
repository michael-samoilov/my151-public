// keeps: API duration math is unreachable through E2E, which stubs the admin API.
import {describe, expect, it} from 'vitest';
import {recordedUsage} from '../../../api/_dashboard';

const minute = 60_000;
const rows = (dex: Parameters<typeof recordedUsage>[0]['dex'], league: Parameters<typeof recordedUsage>[0]['league'] = [], favorites: Parameters<typeof recordedUsage>[0]['favorites'] = []) => ({dex,league,favorites});
const dex = (cid = 'a') => ({cid, firstTs: 0, lastTs: 120 * minute, latestIds: [1], sessions: 70,
  sessionMs: [10 * minute, 10 * minute], sessionLog: [{ts: 20 * minute}, {ts: 120 * minute}]});

describe('recorded usage coverage', () => {
  it('excludes idle gaps, overlaps, and duplicate country records from hours', () => {
    const result = recordedUsage(rows([dex(), dex('a::US')], [{cid:'a', firstTs:0,lastTs:120 * minute,maxSeats:1,
      sessionMs:[10 * minute],sessionLog:[{ts:25 * minute}]}]),null,150 * minute);
    expect(result.all.time).toMatchObject({n:1,total:25 * minute,average:25 * minute,median:25 * minute});
    expect(result.all.sessions).toMatchObject({n:1,total:2});
    expect(result.all.incompleteHistory).toBe(1);
  });
  it('keeps dated-session and duration samples separate without a first-to-last fallback', () => {
    const result = recordedUsage(rows([{...dex(),sessionMs:[],sessionLog:[{ts:20 * minute}]},
      {...dex('b'),sessionMs:[],sessionLog:[]}]),null,150 * minute);
    expect(result.dex.time).toMatchObject({n:0,total:0,average:null,median:null});
    expect(result.dex.sessions).toMatchObject({n:1,total:1});
    expect(result.dex).toMatchObject({browsers:2,missingTime:2,missingSessions:1,incompleteHistory:2});
  });
  it('clips sessions that cross either edge and excludes exact start and future points', () => {
    const result = recordedUsage(rows([{...dex(),sessionMs:[10 * minute,10 * minute,0,0],
      sessionLog:[{ts:20 * minute},{ts:30 * minute},{ts:15 * minute},{ts:40 * minute}]}]),15 * minute,25 * minute);
    expect(result.dex.time.total).toBe(10 * minute);
    expect(result.dex.sessions.total).toBe(1);
  });
  it('does not invent earlier durations when a legacy array is shorter than the log', () => {
    const result = recordedUsage(rows([{...dex(),sessionMs:[10 * minute]}]),null,150 * minute);
    expect(result.dex.time.total).toBe(10 * minute);
    expect(result.dex.sessions.total).toBe(2);
    expect(result.dex.incompleteHistory).toBe(1);
  });
  it('keeps known zero durations, drops bouncers, and joins the 30-minute boundary', () => {
    const result = recordedUsage(rows([{...dex(), sessions:2,sessionMs:[0,0],sessionLog:[{ts:minute},{ts:31 * minute}]},
      {...dex('b'),latestIds:[],sessions:1,sessionMs:[minute]}]),null,150 * minute);
    expect(result.dex.time).toMatchObject({n:1,total:0,average:0,median:0});
    expect(result.dex.sessions).toMatchObject({n:1,total:1});
  });
  it('uses the Picker start and end instead of its end-stamped duration array', () => {
    const result = recordedUsage(rows([],[],[{cid:'p',firstTs:0,lastTs:30 * minute,maxFilled:1,
      sessionLog:[{ts:10 * minute,endTs:30 * minute}],sessionMs:[999999]}]),15 * minute,25 * minute);
    expect(result.favorites.time.total).toBe(10 * minute);
    expect(result.all.time.total).toBe(10 * minute);
  });
  it('clips an open future-ended span and reports partial duration coverage', () => {
    const result = recordedUsage(rows([{...dex(),sessions:2,sessionMs:[10 * minute],
      sessionLog:[{ts:minute},{ts:20 * minute}]}]),null,15 * minute);
    expect(result.dex.time).toMatchObject({n:1,total:5 * minute});
    expect(result.dex.sessions.n).toBe(1);
    expect(result.dex.incompleteHistory).toBe(1);
  });

  it('flags an undated legacy duration instead of assigning it to a dated visit', () => {
    const result = recordedUsage(rows([{...dex(),sessions:undefined,sessionMs:[999 * minute,10 * minute,10 * minute]}]),null,150 * minute);
    expect(result.dex.time.total).toBe(20 * minute);
    expect(result.dex.incompleteHistory).toBe(1);
  });

});

describe('weekly recorded hours', () => {
  const monday = Date.UTC(2026,9,5);
  const week = 7 * 24 * 60 * minute;
  it('unions Suite overlaps and country duplicates before splitting clipped Monday weeks', () => {
    const row = {...dex(),firstTs:monday-60*minute,lastTs:monday+30*minute,sessions:1,
      sessionMs:[60*minute],sessionLog:[{ts:monday+30*minute}]};
    const result = recordedUsage(rows([row,{...row,cid:'a::US'}],[{...row,maxSeats:1,
      sessionMs:[40*minute],sessionLog:[{ts:monday+20*minute}]}]),monday-15*minute,monday+15*minute);
    expect(result.all.weekly).toEqual([
      {week:monday-week,start:monday-15*minute,end:monday,partial:true,totalMs:15*minute},
      {week:monday,start:monday,end:monday+15*minute,partial:true,totalMs:15*minute},
    ]);
    expect(result.all.weekly?.reduce((sum,w)=>sum+w.totalMs,0)).toBe(result.all.time.total);
  });
  it('fills selected empty weeks, counts separate browsers, and excludes missing durations', () => {
    const row = {...dex(),firstTs:monday,lastTs:monday+minute,sessions:1,sessionMs:[minute],sessionLog:[{ts:monday+minute}]};
    const result = recordedUsage(rows([row,{...row,cid:'b'},{...row,cid:'missing',sessionMs:[]}]),monday,monday+3*week);
    expect(result.dex.weekly?.map(w=>[w.totalMs,w.partial])).toEqual([[2*minute,false],[0,false],[0,false]]);
    expect(result.dex.weekly?.reduce((sum,w)=>sum+w.totalMs,0)).toBe(result.dex.time.total);
    expect(result.dex.missingTime).toBe(1);
    expect(recordedUsage(rows([{...row,sessionMs:[]}]),monday,monday+week).dex.weekly).toEqual([]);
  });
  it('starts all-history at actual retained spans and preserves known zero durations', () => {
    const row = {...dex(),firstTs:monday-100*week,lastTs:monday+minute,sessions:1,sessionMs:[0],sessionLog:[{ts:monday+minute}]};
    const result = recordedUsage(rows([row]),null,monday+2*minute);
    expect(result.dex.weekly).toEqual([{week:monday,start:monday+minute,end:monday+2*minute,partial:true,totalMs:0}]);
    expect(result.league.weekly).toEqual([]);
    expect(result.dex.time.n).toBe(1);
  });
});
