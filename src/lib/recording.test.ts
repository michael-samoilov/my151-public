// keeps: Server checkpoint and retained-history boundaries cannot be reached by E2E API stubs.
import {describe, expect, it} from 'vitest';
import {checkpointRecording, parseRecordingFields, retiredCapture, type RecordingFields} from '../../api/_sessionize';
const day = 86_400_000;
const minute = 60_000;
const start = Date.UTC(2026,9,10);
const span = (i: number) => ({start:start+i*60*minute,end:start+i*60*minute+10*minute});

describe('forward recorded-span checkpoints', () => {
  it('keeps hours after more than 50 visits and does not recount an expired replay', () => {
    let fields: RecordingFields = {};
    let log: ReturnType<typeof span>[] = [];
    fields = checkpointRecording(fields,[],[],start,start);
    for (let i=0;i<70;i++) {
      const next = [...log,span(i)];
      const retired = next.length>50 ? next[0].end : undefined;
      fields = checkpointRecording(fields,log,next,span(i).end,span(i).end,retired);
      log = next.slice(-50);
    }
    expect(fields.recording?.totalMs).toBe(700*minute);
    expect(retiredCapture(fields,span(0).end)).toBe(true);
    const replay = checkpointRecording(fields,log,[span(0),...log],span(0).end,span(69).end);
    expect(replay.recording?.totalMs).toBe(700*minute);
    expect(log.length).toBe(50);
  });
  it('starts coverage at server receipt without charging a legacy first-to-last interval', () => {
    const old = [{start:start-100*day,end:start-1000}];
    const result = checkpointRecording({},[],[{start:old[0].start,end:start}],start-10*minute,start);
    expect(result.recording).toMatchObject({coverageFrom:start,checkpointFrom:start,totalMs:0,asOf:start});
    expect(result.activityCoverageFrom).toBe(start);
  });
  it('preserves actual retained spans at upgrade separately from the forward checkpoint start', () => {
    const old = [{start:start-10*minute,end:start}];
    const result = checkpointRecording({},old,old,start,start);
    expect(result.recording).toMatchObject({coverageFrom:start-10*minute,checkpointFrom:start,totalMs:10*minute});
  });
  it('unions overlapping tab spans and accepts delayed extension within the retained window', () => {
    const initial = checkpointRecording({},[],[],start,start);
    const first = checkpointRecording(initial,[],[span(0)],span(0).end,span(0).end);
    const next = [{start:start+5*minute,end:start+15*minute},span(0)];
    const result = checkpointRecording(first,[span(0)],next,start+5*minute,start+20*minute);
    expect(result.recording?.totalMs).toBe(15*minute);
    expect(retiredCapture(result,start+5*minute)).toBe(false);
    expect(first.recording?.totalMs).toBe(10*minute);
  });
  it('clips client future skew until server time reaches it', () => {
    const initial = checkpointRecording({},[],[],start,start);
    const future = [{start,end:start+5*minute}];
    const first = checkpointRecording(initial,[],future,start+5*minute,start+minute);
    expect(first.recording?.totalMs).toBe(minute);
    const second = checkpointRecording(first,future,future,start+5*minute,start+2*minute);
    expect(second.recording?.totalMs).toBe(2*minute);
  });
  it('caps UTC days at 90 and clamps a future capture across midnight', () => {
    const now = start+90*day;
    const initial = {activityCoverageFrom:start,activeDays:Array.from({length:90},(_,i)=>start+i*day)};
    const next = checkpointRecording(initial,[],[],now+day,now+day-1);
    expect(next.activeDays).toHaveLength(90);
    expect(next.activeDays?.[0]).toBe(start+day);
    expect(next.activeDays?.at(-1)).toBe(now);
    expect(next.activityCoverageFrom).toBe(start);
  });
  it('extends retained time after retirement without a new eviction boundary', () => {
    const fields: RecordingFields = {recording:{v:1,coverageFrom:start,checkpointFrom:start,totalMs:20*minute,asOf:start+60*minute,retiredThrough:start+10*minute}};
    const old = [{start:start+50*minute,end:start+60*minute}];
    const result = checkpointRecording(fields,old,[{start:old[0].start,end:start+65*minute}],start+65*minute,start+65*minute);
    expect(result.recording?.totalMs).toBe(25*minute);
    expect(result.recording?.retiredThrough).toBe(start+10*minute);
  });
  it('blocks the discarded-visit gap without suppressing a retained span that overlaps it', () => {
    const fields: RecordingFields={recording:{v:1,coverageFrom:start,checkpointFrom:start,totalMs:10*minute,asOf:start+60*minute,retiredThrough:start+10*minute}};
    expect(retiredCapture(fields,start+11*minute,start+60*minute)).toBe(true);
    expect(retiredCapture(fields,start+40*minute,start+60*minute)).toBe(true);
    expect(retiredCapture(fields,start+11*minute,start+11*minute)).toBe(false);
  });
  it('drops malformed and unknown metadata without rejecting the legacy record', () => {
    expect(parseRecordingFields({recording:{v:1,coverageFrom:start,checkpointFrom:start,totalMs:-1,asOf:start,token:'x'},activeDays:[start],activityCoverageFrom:'x'})).toEqual({});
    expect(parseRecordingFields({recording:{v:1,coverageFrom:start,checkpointFrom:start,totalMs:0,asOf:start,token:'x'},activityCoverageFrom:start,activeDays:[start,start,NaN,start+1]}))
      .toEqual({recording:{v:1,coverageFrom:start,checkpointFrom:start,totalMs:0,asOf:start},activityCoverageFrom:start,activeDays:[start]});
  });
});
