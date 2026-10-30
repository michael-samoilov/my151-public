import {mergeAttention,type AttentionPayload} from './_attention.js';
import {checkpointRecording, mergeSeenDays, retiredCapture, sanitizeRecordingFields, type RecordingFields} from './_sessionize.js';
import cellData from './_favoriteCells.json' with { type: 'json' };
const cells = cellData as Record<string, {kind:string;ids?:number[];sources?:string[]}>;
export const FAVORITE_CLIENTS_KEY = 'favorites:clients';
export const FAVORITE_VERSION_KEY = 'favorites:clients:ver';
export const FAVORITE_TOTAL_CELLS = 257;
export const FAVORITE_SESSION_GAP_MS = 30 * 60_000;
export type FavoriteExportKind = 'full' | 'simplified';
/** `export-shown` reports that the export dialog opened, and `nudge-shown` that the
 *  completion popup pointing at Export appeared. Neither counts an export. */
export type FavoriteBeaconKind = 'progress' | 'completion' | 'export' | 'export-shown' | 'nudge-shown';
export interface FavoriteSnapshot {
  v: 1;
  fills: Record<string, number>;
  filled: number;
  picksFilled: number;
  pointersFilled: number;
  uniqueIds: number[];
  /** Pick cells made shiny and pointer cells set to their shiny option, by cell key, holding the id. Absent when none is, and on records saved before the flag. */
  shiny?: Record<string, number>;
}
export interface FavoriteSessionEntry {
  id: string;
  ts: number;
  endTs: number;
  snapshot: FavoriteSnapshot;
  events: string[];
}
export interface FavoriteRecord extends RecordingFields {
  v: 1;
  cid: string;
  firstTs: number;
  lastTs: number;
  firstAt: string;
  lastAt: string;
  submits: number;
  sessions: number;
  curSessionStart: number;
  maxSessionMs: number;
  sessionMs: number[];
  sessionLog: FavoriteSessionEntry[];
  latest: FavoriteSnapshot;
  maxFilled: number;
  completedAt?: string;
  exportsFull: number;
  exportsSimplified: number;
  seenIds: string[];
  country?: string;
  region?: string;
  tz?: string;
  lang?: string;
  locale?: string;
  switched?: string;
  device?: string;
  os?: string;
  browser?: string;
  firstReferrer?: string;
}
export interface FavoriteBeaconInput {
  attention?: AttentionPayload;
  seen?: number[];
  receivedAt?: number;
  cid: string;
  id: string;
  now: number;
  kind: FavoriteBeaconKind;
  snapshot: FavoriteSnapshot;
  exportKind?: FavoriteExportKind;
  events: string[];
  country?: string;
  region?: string;
  tz?: string;
  lang?: string;
  locale?: string;
  switched?: string;
  device?: string;
  os?: string;
  browser?: string;
  referrer?: string;
}
export function parseFavoriteSnapshot(value: unknown): FavoriteSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  if (o.v !== 1 || !o.fills || typeof o.fills !== 'object' || Array.isArray(o.fills)) return null;
  if (Object.keys(o.fills).length > 264) return null;
  const raw = o.fills as Record<string, unknown>;
  const fills: Record<string, number> = {};
  for (const [key, cell] of Object.entries(cells)) {
    const id = raw[key];
    if (cell.kind === 'pick' && typeof id === 'number' && cell.ids?.includes(id)) fills[key] = id;
  }
  const uniqueIds = [...new Set(Object.values(fills))];
  const picksFilled = Object.keys(fills).length;
  for (const [key, cell] of Object.entries(cells)) {
    const id = raw[key];
    if (cell.kind === 'pointer' && typeof id === 'number' && cell.sources?.some(source => fills[source] === id)) fills[key] = id;
  }
  const filled = Object.keys(fills).length;
  const rawShiny = o.shiny && typeof o.shiny === 'object' && !Array.isArray(o.shiny) ? o.shiny as Record<string, unknown> : {};
  const shiny = Object.fromEntries(Object.entries(rawShiny).filter((entry): entry is [string, number] => fills[entry[0]] === entry[1]));
  return {v:1,fills,filled,picksFilled,pointersFilled:filled-picksFilled,uniqueIds,...(Object.keys(shiny).length ? {shiny} : {})};
}
export function parseFavoriteRecord(raw: unknown): FavoriteRecord | null {
  let value = raw;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return null; } }
  if (!value || typeof value !== 'object') return null;
  const r = value as FavoriteRecord;
  const validTime = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 8_640_000_000_000_000;
  if (r.v !== 1 || typeof r.cid !== 'string' || !validTime(r.firstTs) || !validTime(r.lastTs)
    || !parseFavoriteSnapshot(r.latest) || !Array.isArray(r.sessionLog) || !Array.isArray(r.seenIds)) return null;
  const nonnegative = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  if (!['submits','sessions','maxFilled','exportsFull','exportsSimplified'].every(key => nonnegative((r as unknown as Record<string,unknown>)[key]))) return null;
  if (r.maxFilled > FAVORITE_TOTAL_CELLS || r.firstTs > r.lastTs) return null;
  const sessionLog = r.sessionLog.flatMap(session => {
    const snapshot = parseFavoriteSnapshot(session?.snapshot);
    if (!snapshot || !validTime(session.ts) || !validTime(session.endTs) || session.endTs < session.ts || typeof session.id !== 'string') return [];
    return [{id:session.id,ts:session.ts,endTs:session.endTs,snapshot,
      events:Array.isArray(session.events)?session.events.filter((event):event is string=>typeof event==='string'&&event.startsWith('favorites-')).slice(0,20):[]}];
  }).sort((a,b)=>a.ts-b.ts).slice(-50);
  const sessionMs = sessionLog.map(session=>session.endTs-session.ts);
  return sanitizeRecordingFields({...r,firstAt:new Date(r.firstTs).toISOString(),lastAt:new Date(r.lastTs).toISOString(),latest:parseFavoriteSnapshot(r.latest)!,sessionLog,sessionMs,
    maxSessionMs:Math.max(nonnegative(r.maxSessionMs)?r.maxSessionMs:0,...sessionMs),curSessionStart:sessionLog.at(-1)?.ts??r.lastTs,
    seenIds:r.seenIds.filter((id):id is string=>typeof id==='string'&&/^[\w-]{8,80}$/.test(id)).slice(-256)});
}
export function favoriteSessionAt<T extends FavoriteSessionEntry>(log: T[], now: number): T | undefined {
  return [...log].reverse().find(s => now >= s.ts - FAVORITE_SESSION_GAP_MS && now <= s.endTs + FAVORITE_SESSION_GAP_MS);
}
export function mergeFavoriteRecord(existing: FavoriteRecord | null, input: FavoriteBeaconInput): FavoriteRecord {
  if (existing?.seenIds.includes(input.id)) return existing;
  const { now, snapshot } = input;
  const oldSpans = (existing?.sessionLog ?? []).map(s=>({start:s.ts,end:s.endTs}));
  const rec: FavoriteRecord = existing ? structuredClone(existing) : {
    v:1,cid:input.cid,firstTs:now,lastTs:now,firstAt:new Date(now).toISOString(),lastAt:new Date(now).toISOString(),
    submits:0,sessions:0,curSessionStart:now,maxSessionMs:0,sessionMs:[],sessionLog:[],latest:snapshot,maxFilled:0,
    exportsFull:0,exportsSimplified:0,seenIds:[],
  };
  const attention=mergeAttention(existing?.attention,input.attention,input.receivedAt ?? input.now);
  if(attention)rec.attention=attention;
  const seenDays=mergeSeenDays(existing?.seenDays,input.seen,input.receivedAt ?? input.now);
  if(seenDays)rec.seenDays=seenDays;
  rec.seenIds = [...rec.seenIds,input.id].slice(-256);
  rec.submits++;
  const log = rec.sessionLog;
  if (!retiredCapture(existing ?? {},now,Math.min(...oldSpans.map(s=>s.start)),FAVORITE_SESSION_GAP_MS)) {
    let session = favoriteSessionAt(log, now);
    if (!session) {
      session = {id:input.id,ts:now,endTs:now,snapshot,events:[]};
      log.push(session);log.sort((a,b)=>a.ts-b.ts);rec.sessions++;
    }
    session.ts = Math.min(session.ts, now);
    if (now >= session.endTs) {session.endTs=now;session.snapshot=snapshot;}
    session.events = [...new Set([...session.events,...input.events])];
  }
  const retiredThrough = log.length > 50 ? Math.max(...log.slice(0,log.length-50).map(s=>s.endTs)) : undefined;
  Object.assign(rec,checkpointRecording(existing ?? {},oldSpans,log.map(s=>({start:s.ts,end:s.endTs})),now,input.receivedAt ?? now,retiredThrough));
  rec.sessionLog = log.slice(-50);
  rec.sessionMs = rec.sessionLog.map(s=>s.endTs-s.ts);
  rec.maxSessionMs = Math.max(rec.maxSessionMs,...rec.sessionMs);
  rec.curSessionStart = rec.sessionLog.at(-1)?.ts ?? rec.curSessionStart;
  rec.maxFilled = Math.max(rec.maxFilled,snapshot.filled);
  if (snapshot.filled === FAVORITE_TOTAL_CELLS && !rec.completedAt) rec.completedAt = new Date(now).toISOString();
  if (input.kind === 'export') {
    if (input.exportKind === 'full') rec.exportsFull++;
    if (input.exportKind === 'simplified') rec.exportsSimplified++;
  }
  if (now < rec.firstTs) {rec.firstTs=now;rec.firstAt=new Date(now).toISOString();}
  if (now >= rec.lastTs) {
    rec.lastTs=now;rec.lastAt=new Date(now).toISOString();rec.latest=snapshot;
    for (const key of ['country','region','tz','lang','locale','switched','device','os','browser'] as const) {
      if (input[key]) rec[key] = input[key];
    }
  }
  if (!rec.firstReferrer && input.referrer) rec.firstReferrer=input.referrer;
  return rec;
}
