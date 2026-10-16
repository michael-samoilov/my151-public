import {parseAttentionRecording,type AttentionRecording} from './_attention.js';
type SessionTarget =
  | { kind: 'join'; index: number }
  | { kind: 'insert'; index: number };

export function alignSessionMs(logLen: number, ms: readonly number[]): number[] {
  if (logLen <= 0) return [];
  if (ms.length === logLen) return ms.slice();
  if (ms.length > logLen) return ms.slice(ms.length - logLen);
  return [...Array<number>(logLen - ms.length).fill(0), ...ms];
}

export function sessionTarget(
  ends: readonly number[],
  durs: readonly number[],
  now: number,
  gapMs: number,
): SessionTarget {
  if (ends.length === 0) return { kind: 'insert', index: 0 };
  let best: { index: number; dist: number } | null = null;
  for (let i = 0; i < ends.length; i++) {
    const end = ends[i];
    const start = end - (durs[i] ?? 0);
    const dist = now < start ? start - now : now > end ? now - end : 0;
    if (dist <= gapMs && (best === null || dist < best.dist || (dist === best.dist && i > best.index))) {
      best = { index: i, dist };
    }
  }
  if (best) return { kind: 'join', index: best.index };
  let index = 0;
  while (index < ends.length && ends[index] <= now) index += 1;
  return { kind: 'insert', index };
}

export function sortSessions<T extends { ts: number }>(
  log: readonly T[],
  ms: readonly number[],
): { log: T[]; ms: number[] } {
  const aligned = alignSessionMs(log.length, ms);
  const order = log.map((_, i) => i).sort((a, b) => log[a].ts - log[b].ts);
  return { log: order.map((i) => log[i]), ms: order.map((i) => aligned[i]) };
}

const PRODUCT_START_MS = Date.parse('2024-01-01T00:00:00.000Z');
const FUTURE_SKEW_MS = 5 * 60_000;

export function parseCapturedAt(v: unknown, receivedAt: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const ts = Math.round(v);
  if (ts < PRODUCT_START_MS || ts > receivedAt + FUTURE_SKEW_MS) return null;
  return ts;
}

export function isSubsetRegression(incoming: Iterable<number>, latest: Iterable<number>): boolean {
  const have = new Set(latest);
  if (have.size === 0) return false;
  let n = 0;
  for (const id of incoming) {
    n += 1;
    if (!have.has(id)) return false;
  }
  return n > 0 && n < have.size;
}

export type SessionCounts = { cards: number; seats: number };

function countAgreement(a: SessionCounts, b: SessionCounts): number {
  const cardMax = Math.max(a.cards, b.cards);
  const seatMax = Math.max(a.seats, b.seats);
  if (cardMax === 0 || seatMax === 0) return 0;
  return Math.min(Math.min(a.cards, b.cards) / cardMax, Math.min(a.seats, b.seats) / seatMax);
}

export function withoutDropRestorePhantoms<T>(
  items: readonly T[],
  idsOf: (item: T) => readonly number[],
  countsOf?: (item: T) => SessionCounts,
): T[] {
  if (items.length < 3) return items.slice();
  return items.filter((item, i) => {
    if (i === 0 || i === items.length - 1) return true;
    const prev = idsOf(items[i - 1]);
    const next = idsOf(items[i + 1]);
    const cur = idsOf(item);
    if (cur.length > 0) {
      if (!isSubsetRegression(cur, prev) || !isSubsetRegression(cur, next)) return true;
      const prevSet = new Set(prev);
      const nextSet = new Set(next);
      let overlap = 0;
      for (const id of prevSet) if (nextSet.has(id)) overlap += 1;
      const union = prevSet.size + nextSet.size - overlap;
      const jaccard = union === 0 ? 1 : overlap / union;
      return jaccard < 0.8;
    }
    if (!countsOf) return true;
    const prevC = countsOf(items[i - 1]);
    const nextC = countsOf(items[i + 1]);
    const curC = countsOf(item);
    if (curC.cards >= prevC.cards || curC.cards >= nextC.cards) return true;
    if (curC.seats >= prevC.seats || curC.seats >= nextC.seats) return true;
    return countAgreement(prevC, nextC) < 0.8;
  });
}

export interface RecordingCheckpoint {
  v: 1;
  /** Earliest retained baseline span. Older history can be missing. */
  coverageFrom: number;
  /** First upgraded server receipt, independent of client clock skew. */
  checkpointFrom: number;
  totalMs: number;
  asOf: number;
  retiredThrough?: number;
}
export interface RecordingFields {
  attention?: AttentionRecording;
  recording?: RecordingCheckpoint;
  activeDays?: number[];
  activityCoverageFrom?: number;
}
type RecordingSpan = {start: number; end: number};
const UTC_DAY_MS = 86_400_000;
const stamp = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 8_640_000_000_000_000;
const utcDay = (n: number) => Math.floor(n / UTC_DAY_MS) * UTC_DAY_MS;

export function parseRecordingFields(raw: unknown): RecordingFields {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: RecordingFields = {};
  const attention=parseAttentionRecording(r.attention);
  if(attention)out.attention=attention;
  const checkpoint = r.recording as Partial<RecordingCheckpoint> | undefined;
  if (checkpoint?.v === 1 && stamp(checkpoint.coverageFrom) && stamp(checkpoint.asOf)
    && stamp(checkpoint.checkpointFrom) && checkpoint.checkpointFrom >= checkpoint.coverageFrom && checkpoint.asOf >= checkpoint.checkpointFrom && typeof checkpoint.totalMs === 'number'
    && Number.isSafeInteger(checkpoint.totalMs) && checkpoint.totalMs >= 0
    && (checkpoint.retiredThrough === undefined || (stamp(checkpoint.retiredThrough) && checkpoint.retiredThrough <= checkpoint.asOf))) {
    out.recording = {v:1,coverageFrom:checkpoint.coverageFrom,checkpointFrom:checkpoint.checkpointFrom,totalMs:checkpoint.totalMs,asOf:checkpoint.asOf,
      ...(checkpoint.retiredThrough === undefined ? {} : {retiredThrough:checkpoint.retiredThrough})};
  }
  if (stamp(r.activityCoverageFrom) && Array.isArray(r.activeDays)) {
    out.activityCoverageFrom = r.activityCoverageFrom;
    out.activeDays = [...new Set(r.activeDays.filter((d): d is number => stamp(d) && d === utcDay(d)))].sort((a,b)=>a-b).slice(-90);
  }
  return out;
}

export function retiredCapture(record: RecordingFields, capturedAt: number, earliestRetainedStart = Infinity, gapMs = 30 * 60_000): boolean {
  return record.recording?.retiredThrough !== undefined && capturedAt <= record.recording.retiredThrough + gapMs && capturedAt < earliestRetainedStart;
}

function recordedSpanMs(spans: readonly RecordingSpan[], from: number, until: number): number {
  const clipped = spans.filter(s => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start)
    .map(s => ({start:Math.max(s.start,from),end:Math.min(s.end,until)}))
    .filter(s => s.end > s.start).sort((a,b)=>a.start-b.start || a.end-b.end);
  let total = 0, end = -Infinity;
  for (const span of clipped) {
    total += Math.max(0,span.end-Math.max(span.start,end));
    end = Math.max(end,span.end);
  }
  return total;
}

export function checkpointRecording(
  previous: RecordingFields,
  oldSpans: readonly RecordingSpan[],
  newSpans: readonly RecordingSpan[],
  capturedAt: number,
  receivedAt: number,
  retiredThrough?: number,
): RecordingFields {
  const coverageFrom = oldSpans.reduce((earliest,s) => Number.isFinite(s.start) && s.end >= s.start ? Math.max(0,Math.min(earliest,s.start)) : earliest,receivedAt);
  const prior = previous.recording ?? {v:1 as const,coverageFrom,checkpointFrom:receivedAt,totalMs:recordedSpanMs(oldSpans,coverageFrom,receivedAt),asOf:receivedAt};
  const asOf = Math.max(prior.asOf,receivedAt);
  const from = Math.max(prior.coverageFrom,prior.retiredThrough ?? -Infinity);
  const delta = recordedSpanMs(newSpans,from,asOf)-recordedSpanMs(oldSpans,from,prior.asOf);
  const watermark = Math.max(prior.retiredThrough ?? -Infinity,retiredThrough === undefined ? -Infinity : Math.min(retiredThrough,asOf));
  const recording: RecordingCheckpoint = {v:1,coverageFrom:prior.coverageFrom,checkpointFrom:prior.checkpointFrom,totalMs:prior.totalMs+Math.max(0,delta),asOf,
    ...(watermark === -Infinity ? {} : {retiredThrough:watermark})};
  const today = utcDay(asOf);
  const earliest = today-89*UTC_DAY_MS;
  const activeDays = [...new Set([...(previous.activeDays ?? []),utcDay(Math.min(capturedAt,receivedAt))])]
    .filter(d => d >= earliest && d <= today).sort((a,b)=>a-b).slice(-90);
  return {recording,activeDays,activityCoverageFrom:previous.activityCoverageFrom ?? receivedAt};
}

export function endStampedSpans(record: {sessionLog?: {ts:number}[];sessionMs?: number[]}): RecordingSpan[] {
  const log = record.sessionLog ?? [];
  const durations = record.sessionMs ?? [];
  const n = Math.min(log.length,durations.length);
  return log.slice(log.length-n).flatMap((s,i) => {
    const ms = durations[durations.length-n+i];
    return Number.isFinite(ms) && ms >= 0 ? [{start:s.ts-ms,end:s.ts}] : [];
  });
}

export function sanitizeRecordingFields<T extends RecordingFields>(record: T): T {
  const copy = {...record};
  delete copy.attention;
  delete copy.recording;
  delete copy.activeDays;
  delete copy.activityCoverageFrom;
  return Object.assign(copy,parseRecordingFields(record));
}
