// keeps: E2E stubs each analytics write, so durable span and replay accounting needs API-level coverage.
import {describe, expect, it} from 'vitest';
import {buildBrowser} from '../../api/_dashboard';
import {parseRecord} from '../../api/_shared';
import {parseLeagueRecord, mergeLeagueRecord, type LeagueRecord, type LeagueBeaconInput} from '../../api/_leagueRecord';
import {mergeFavoriteRecord, parseFavoriteSnapshot, type FavoriteRecord, type FavoriteBeaconInput} from '../../api/_favoriteRecord';
const minute = 60_000;
const start = Date.UTC(2026,9,10);
const league = (now: number): LeagueBeaconInput => ({cid:'checkpoint-browser',now,receivedAt:now,kind:'progress',capturedKnown:true,
  summary:{cards:1,seats:1,typed:0,named:0,aces:0,leagueNamed:false},geo:{country:'US'},ua:{device:'Desktop',os:'Linux',browser:'Chrome'}});
const favorite = (now: number, id: string): FavoriteBeaconInput => ({cid:'checkpoint-browser',id,now,receivedAt:now,kind:'progress',snapshot:parseFavoriteSnapshot({v:1,fills:{}})!,events:[]});

describe('checkpoint wiring in each existing tool write', () => {
  it('keeps League duration through eviction and blocks an expired replay from inventing a session', () => {
    let record: LeagueRecord | null = null;
    for (let i=0;i<70;i++) {
      record = mergeLeagueRecord(record,league(start+i*60*minute));
      record = mergeLeagueRecord(record,league(start+i*60*minute+10*minute));
    }
    expect(record!.recording?.totalMs).toBe(700*minute);
    expect(record!.sessionLog).toHaveLength(50);
    const frozen = structuredClone(record!);
    const replay = mergeLeagueRecord(record!,{...league(start),receivedAt:start+70*60*minute});
    expect(replay.sessions).toBe(70);
    expect(replay.recording?.totalMs).toBe(700*minute);
    expect(replay.latest).toEqual(frozen.latest);
    expect(record).toEqual(frozen);
    for(const gap of [minute,30*minute]) {
      const near=mergeLeagueRecord(record!,{...league(record!.recording!.retiredThrough!+gap),receivedAt:start+70*60*minute});
      expect(near.sessions).toBe(70);
      expect(near.recording?.totalMs).toBe(700*minute);
    }
  });
  it('keeps Picker duration and blocks old replay after both request and session history eviction', () => {
    let record: FavoriteRecord | null = null;
    for (let i=0;i<140;i++) {
      record = mergeFavoriteRecord(record,favorite(start+i*60*minute,`request-${i}-start`));
      record = mergeFavoriteRecord(record,favorite(start+i*60*minute+10*minute,`request-${i}-end`));
    }
    expect(record!.recording?.totalMs).toBe(1400*minute);
    expect(record!.sessionLog).toHaveLength(50);
    const replay = mergeFavoriteRecord(record!,{...favorite(start,'request-0-start'),receivedAt:start+140*60*minute});
    expect(replay.sessions).toBe(140);
    expect(replay.recording?.totalMs).toBe(1400*minute);
    const near=mergeFavoriteRecord(record!,{...favorite(record!.recording!.retiredThrough!+minute,'request-near-retired'),receivedAt:start+140*60*minute});
    expect(near.sessions).toBe(140);
    expect(near.recording?.totalMs).toBe(1400*minute);
  });
  it('uses server receipt for activity coverage while future client skew cannot add tomorrow', () => {
    const now = start+86_400_000-1;
    const record = mergeLeagueRecord(null,{...league(now+minute),receivedAt:now});
    expect(record.activityCoverageFrom).toBe(now);
    expect(record.activeDays).toEqual([start]);
    expect(record.recording?.checkpointFrom).toBe(now);
  });
  it('keeps null and invalid stored data out of both legacy record parsers', () => {
    for (const raw of ['null','[]','"text"',null,[],3]) {
      expect(parseRecord(raw)).toBeNull();
      expect(parseLeagueRecord(raw)).toBeNull();
    }
  });

  it('carries League checkpoint and activity coverage through the admin detail adapter', () => {
    const record=mergeLeagueRecord(null,league(start));
    const detail=buildBrowser(record.cid,{dex:null,league:record,favorite:null,exportSurveySkips:null});
    expect(detail.league?.recording).toEqual(record.recording);
    expect(detail.league?.activityCoverageFrom).toBe(start);
    expect(detail.league?.activeDays).toEqual([start]);
  });

});
