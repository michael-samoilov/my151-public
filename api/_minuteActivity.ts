export const MINUTE_ACTIVITY_VERSION = 1;
export const MINUTE_ACTIVITY_RETENTION_DAYS = 400;
export const MINUTE_ACTIVITY_MIN_GAP_MS = 60_000;
export const MINUTE_ACTIVITY_MAX_BATCHES = 4;
export const MINUTE_ACTIVITY_MAX_BUCKETS = 120;

export type MinuteActivityTool = 'dex' | 'league' | 'favorites';
export interface MinuteActivityBucket {
  run: string;
  first: number;
  last: number;
}
export interface MinuteActivityBatch {
  id: string;
  tab: string;
  day: string;
  buckets: MinuteActivityBucket[];
  incomplete?: true;
}
export interface MinuteActivityPayload {
  v: 1;
  batches: MinuteActivityBatch[];
}
export interface MinuteActivityAck {
  accepted: string[];
  status: 'recorded' | 'paused' | 'disabled' | 'invalid';
  retryAt?: number;
}
export interface StoredMinuteActivityBatch extends MinuteActivityBatch {
  cid: string;
  tool: MinuteActivityTool;
  receivedAt?: number;
}

const DAY_MS = 86_400_000;
const validId = (value: unknown): value is string => typeof value === 'string' && /^[-\w]{8,80}$/.test(value);
export function parseMinuteActivity(raw: unknown, receivedAt: number): MinuteActivityPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (value.v !== 1 || !Array.isArray(value.batches) || value.batches.length > MINUTE_ACTIVITY_MAX_BATCHES) return null;
  const batches: MinuteActivityBatch[] = [], ids = new Set<string>();
  for (const item of value.batches) {
    if (!item || typeof item !== 'object') return null;
    const b = item as Record<string, unknown>;
    if (!validId(b.id) || ids.has(b.id) || !validId(b.tab) || typeof b.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.day) || !Array.isArray(b.buckets) || !b.buckets.length || b.buckets.length > MINUTE_ACTIVITY_MAX_BUCKETS || b.incomplete !== undefined && b.incomplete !== true) return null;
    if (Date.parse(b.day) + MINUTE_ACTIVITY_RETENTION_DAYS * DAY_MS <= receivedAt) return null;
    ids.add(b.id);
    const buckets: MinuteActivityBucket[] = [];
    for (const item of b.buckets) {
      if (!item || typeof item !== 'object') return null;
      const bucket = item as Record<string, unknown>;
      if (!validId(bucket.run) || typeof bucket.first !== 'number' || typeof bucket.last !== 'number' || !Number.isSafeInteger(bucket.first) || !Number.isSafeInteger(bucket.last) || bucket.first < Date.UTC(2024, 0, 1) || bucket.last < bucket.first || Math.floor(bucket.first / 60_000) !== Math.floor(bucket.last / 60_000) || bucket.last > receivedAt + 5 * 60_000 || bucket.first < receivedAt - MINUTE_ACTIVITY_RETENTION_DAYS * DAY_MS || new Date(bucket.first).toISOString().slice(0, 10) !== b.day) return null;
      buckets.push({run: bucket.run, first: bucket.first, last: bucket.last});
    }
    batches.push({id: b.id, tab: b.tab, day: b.day, buckets, ...(b.incomplete ? {incomplete: true as const} : {})});
  }
  return {v: 1, batches};
}
export interface ReconstructedBrowserActivity {
  cid: string; totalMs: number; sessions: number; intervals: {start: number; end: number}[];
}
export function reconstructMinuteActivity(batches: readonly StoredMinuteActivityBatch[], gapMs: number) {
  if (!Number.isSafeInteger(gapMs) || gapMs < MINUTE_ACTIVITY_MIN_GAP_MS) throw new RangeError('Minimum session gap is one minute');
  const runs = new Map<string, {cid: string; buckets: Map<number, {start: number; end: number}>}>();
  for (const b of batches) for (const bucket of b.buckets) {
    const key = JSON.stringify([b.cid, b.tool, b.tab, bucket.run]);
    const run = runs.get(key) ?? {cid: b.cid, buckets: new Map()};
    const minute = Math.floor(bucket.first / 60_000), existing = run.buckets.get(minute);
    run.buckets.set(minute, {start: Math.min(existing?.start ?? Infinity, bucket.first), end: Math.max(existing?.end ?? -Infinity, bucket.last)});
    runs.set(key, run);
  }
  const byBrowser = new Map<string, {start: number; end: number}[]>();
  for (const run of runs.values()) {
    const intervals: {start: number; end: number}[] = [];
    for (const bucket of [...run.buckets.values()].sort((a,b)=>a.start-b.start)) {
      const previous = intervals.at(-1);
      if (previous && bucket.start - previous.end < gapMs) previous.end = Math.max(previous.end, bucket.end);
      else intervals.push({...bucket});
    }
    byBrowser.set(run.cid, [...(byBrowser.get(run.cid) ?? []), ...intervals]);
  }
  const browsers: ReconstructedBrowserActivity[] = [];
  for (const [cid, source] of byBrowser) {
    const intervals: {start:number;end:number}[] = [];
    for (const s of source.sort((a,b)=>a.start-b.start || a.end-b.end)) {
      const p=intervals.at(-1);
      if (p && s.start <= p.end) p.end=Math.max(p.end,s.end); else intervals.push({...s});
    }
    let sessions=0,end=-Infinity;
    for (const s of intervals) {if(s.start-end>=gapMs)sessions++;end=Math.max(end,s.end);}
    browsers.push({cid,intervals,sessions,totalMs:intervals.reduce((n,s)=>n+s.end-s.start,0)});
  }
  return {browsers,totalMs:browsers.reduce((n,b)=>n+b.totalMs,0),sessions:browsers.reduce((n,b)=>n+b.sessions,0),incomplete:batches.some(b=>b.incomplete)};
}
