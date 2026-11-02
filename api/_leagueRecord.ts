import {mergeAttention,type AttentionPayload} from './_attention.js';
import { alignSessionMs, isSubsetRegression, sessionTarget, checkpointRecording, endStampedSpans, retiredCapture, sanitizeRecordingFields, mergeSeenDays, type RecordingFields } from './_sessionize.js';

export const LEAGUE_SESSION_GAP_MS = 30 * 60_000;
const LEAGUE_MAX_SESSIONS = 50;

export const LEAGUE_CLIENTS_KEY = 'league:clients';
export const LEAGUE_VERSION_KEY = 'league:clients:ver';

const LEAGUE_BEACON_KINDS = ['progress', 'export'] as const;
export type LeagueBeaconKind = (typeof LEAGUE_BEACON_KINDS)[number];
export const LEAGUE_EXPORT_KINDS = ['card', 'league'] as const;
export type LeagueExportKind = (typeof LEAGUE_EXPORT_KINDS)[number];

export interface LeagueSummary {
  cards: number;
  seats: number;
  typed: number;
  named: number;
  aces: number;
  leagueNamed: boolean;
}

const SEATS_PER_CARD = 6;
const MAX_STAGES = 5;
const MAX_POKEMON_ID = 99_999;
const MAX_ROW = 20;
export const LEAGUE_BOSS_ROW = 11;

export interface LeagueLineShape {
  b: number[];
  bd?: number[];
  s?: 1;
}

export interface LeagueCardShape {
  i: number;
  t?: string;
  l: LeagueLineShape[];
  ace?: number;
  aceId?: number;
  pa?: number;
  tm?: number;
  lg?: [seat: number, pokemonId: number, shiny?: 1][];
  pw?: [row: number, seat: number, formIndex: number, isDynamax: number][];
}

export interface LeagueSessionEntry {
  ts: number;
  summary: LeagueSummary;
  country?: string;
  dev?: string;
  page?: string;
  events?: string[];
  cards?: LeagueCardShape[];
}

export interface LeagueRecord extends RecordingFields {
  cid: string;
  firstTs: number;
  firstAt: string;
  lastTs: number;
  lastAt: string;
  submits: number;
  sessions: number;
  curSessionStart: number;
  maxSessionMs: number;
  sessionMs: number[];
  sessionLog: LeagueSessionEntry[];
  maxCards: number;
  maxSeats: number;
  latest: LeagueSummary;
  latestCards?: LeagueCardShape[];
  exportsCard: number;
  exportsLeague: number;
  exportedCardAt?: string;
  exportedLeagueAt?: string;
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

export function isLeagueBeaconKind(s: unknown): s is LeagueBeaconKind {
  return typeof s === 'string' && (LEAGUE_BEACON_KINDS as readonly string[]).includes(s);
}
export function isLeagueExportKind(s: unknown): s is LeagueExportKind {
  return typeof s === 'string' && (LEAGUE_EXPORT_KINDS as readonly string[]).includes(s);
}

export const CARD_COUNT = 14;
const SEAT_MAX = 6 * CARD_COUNT;

export const CARD_TEAM_SIZES = [2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6] as const;

function fullGymsInCards(cards: LeagueCardShape[] | undefined): number {
  if (!cards || cards.length === 0) return 0;
  const full = new Set<number>();
  for (const card of cards) {
    const need = CARD_TEAM_SIZES[card.i] ?? CARD_TEAM_SIZES[CARD_TEAM_SIZES.length - 1];
    if (card.l.length >= need) full.add(card.i);
  }
  return full.size;
}

function hasCardStructure(record: LeagueRecord): boolean {
  if (record.latestCards !== undefined) return true;
  return record.sessionLog.some((s) => s.cards !== undefined);
}

export function peakFullGyms(record: LeagueRecord): number {
  if (!hasCardStructure(record)) return record.maxCards;
  let peak = fullGymsInCards(record.latestCards);
  for (const snap of record.sessionLog) {
    const n = fullGymsInCards(snap.cards);
    if (n > peak) peak = n;
  }
  return peak;
}

function clampInt(v: unknown, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(max, Math.round(v)));
}

export function parseSummary(v: unknown): LeagueSummary | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const cards = clampInt(o.cards, CARD_COUNT);
  const seats = clampInt(o.seats, SEAT_MAX);
  const typed = clampInt(o.typed, CARD_COUNT);
  const named = clampInt(o.named, CARD_COUNT);
  const aces = clampInt(o.aces, CARD_COUNT);
  if (cards === null || seats === null || typed === null || named === null || aces === null) return null;
  return { cards, seats, typed, named, aces, leagueNamed: o.leagueNamed === true };
}

function idOrNull(v: unknown, max: number): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > max) return null;
  return v;
}

function intInRange(v: unknown, lo: number, hi: number): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) return null;
  return v;
}

export function parseCards(v: unknown): LeagueCardShape[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: LeagueCardShape[] = [];
  for (const raw of v.slice(0, CARD_COUNT)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const c = raw as Record<string, unknown>;
    const i = intInRange(c.i, 0, CARD_COUNT - 1);
    if (i === null) continue;

    const lines: LeagueLineShape[] = [];
    if (Array.isArray(c.l)) {
      for (const rawLine of c.l.slice(0, SEATS_PER_CARD)) {
        if (!rawLine || typeof rawLine !== 'object' || Array.isArray(rawLine)) continue;
        const ln = rawLine as Record<string, unknown>;
        if (!Array.isArray(ln.b)) continue;
        const branch = ln.b
          .slice(0, MAX_STAGES)
          .map((id) => idOrNull(id, MAX_POKEMON_ID))
          .filter((id): id is number => id !== null);
        if (branch.length === 0) continue;
        const line: LeagueLineShape = { b: branch };
        if (Array.isArray(ln.bd)) {
          const bd = ln.bd
            .slice(0, branch.length)
            .map((r) => intInRange(r, 1, MAX_ROW + 1))
            .filter((r): r is number => r !== null);
          if (bd.length === branch.length) line.bd = bd;
        }
        if (ln.s === 1) line.s = 1;
        lines.push(line);
      }
    }

    const card: LeagueCardShape = { i, l: lines };
    if (typeof c.t === 'string' && /^[a-z]{1,16}$/.test(c.t)) card.t = c.t;
    const ace = intInRange(c.ace, 1, SEATS_PER_CARD);
    if (ace !== null) card.ace = ace;
    const aceId = idOrNull(c.aceId, MAX_POKEMON_ID);
    if (aceId !== null) card.aceId = aceId;
    const pa = idOrNull(c.pa, MAX_POKEMON_ID);
    if (pa !== null) card.pa = pa;
    const tm = idOrNull(c.tm, MAX_POKEMON_ID);
    if (tm !== null) card.tm = tm;

    if (Array.isArray(c.lg)) {
      const lg: [number, number, 1?][] = [];
      for (const pair of c.lg.slice(0, SEATS_PER_CARD)) {
        if (!Array.isArray(pair)) continue;
        const seat = intInRange(pair[0], 1, SEATS_PER_CARD);
        const id = idOrNull(pair[1], MAX_POKEMON_ID);
        if (seat !== null && id !== null) lg.push(pair[2] === 1 ? [seat, id, 1] : [seat, id]);
      }
      if (lg.length > 0) card.lg = lg;
    }

    if (Array.isArray(c.pw)) {
      const pw: [number, number, number, number][] = [];
      for (const t of c.pw.slice(0, MAX_ROW)) {
        if (!Array.isArray(t)) continue;
        const row = intInRange(t[0], 1, MAX_ROW);
        const seat = intInRange(t[1], 1, SEATS_PER_CARD);
        const form = intInRange(t[2], 0, 32);
        const kind = intInRange(t[3], 0, 1);
        if (row !== null && seat !== null && form !== null && kind !== null) {
          pw.push([row, seat, form, kind]);
        }
      }
      if (pw.length > 0) card.pw = pw;
    }

    out.push(card);
  }
  return out;
}

export interface LeagueBeaconInput {
  attention?: AttentionPayload;
  seen?: number[];
  receivedAt?: number;
  cid: string;
  kind: LeagueBeaconKind;
  exportKind?: LeagueExportKind;
  summary: LeagueSummary;
  cards?: LeagueCardShape[];
  now: number;
  geo: { country?: string; region?: string; tz?: string };
  ua: { device: string; os: string; browser: string };
  lang?: string;
  locale?: string;
  switched?: string;
  page?: string;
  referrer?: string;
  capturedKnown?: boolean;
  events?: string[];
}

function memberIds(cards?: LeagueCardShape[]): number[] {
  return (cards ?? []).flatMap((c) => c.l.flatMap((line) => line.b));
}

export function mergeLeagueRecord(existing: LeagueRecord | null, b: LeagueBeaconInput): LeagueRecord {
  const at = new Date(b.now).toISOString();
  const oldSpans = existing ? endStampedSpans(existing) : [];
  const rec: LeagueRecord = existing
    ? { ...existing, sessionMs: [...existing.sessionMs], sessionLog: [...existing.sessionLog] }
    : {
        cid: b.cid,
        firstTs: b.now,
        firstAt: at,
        lastTs: b.now,
        lastAt: at,
        submits: 0,
        sessions: 1,
        curSessionStart: b.now,
        maxSessionMs: 0,
        sessionMs: [],
        sessionLog: [],
        maxCards: 0,
        maxSeats: 0,
        latest: b.summary,
        exportsCard: 0,
        exportsLeague: 0,
      };

  const attention=mergeAttention(existing?.attention,b.attention,b.receivedAt ?? b.now);
  if(attention)rec.attention=attention;
  const seenDays=mergeSeenDays(existing?.seenDays,b.seen,b.receivedAt ?? b.now);
  if(seenDays)rec.seenDays=seenDays;
  rec.submits += 1;
  rec.maxCards = Math.max(rec.maxCards, b.summary.cards);
  rec.maxSeats = Math.max(rec.maxSeats, b.summary.seats);
  if (b.kind === 'export') {
    if (b.exportKind === 'card') {
      rec.exportsCard += 1;
      rec.exportedCardAt = at;
    } else if (b.exportKind === 'league') {
      rec.exportsLeague += 1;
      rec.exportedLeagueAt = at;
    }
  }
  rec.country = b.geo.country;
  rec.region = b.geo.region;
  rec.tz = b.geo.tz;
  rec.lang = b.lang;
  if (b.locale) rec.locale = b.locale;
  if (b.switched) rec.switched = b.switched;
  rec.device = b.ua.device;
  rec.os = b.ua.os;
  rec.browser = b.ua.browser;
  if (b.referrer && !rec.firstReferrer) rec.firstReferrer = b.referrer;

  const devStamp = [b.ua.device, b.ua.os, b.ua.browser].filter((p) => p && p !== 'Unknown').join(' · ');
  const makeEntry = (
    ts: number,
    cards: LeagueCardShape[] | undefined,
    prev?: LeagueSessionEntry,
  ): LeagueSessionEntry => {
    const mergedEvents = [...(prev?.events ?? [])];
    for (const e of b.events ?? []) if (!mergedEvents.includes(e)) mergedEvents.push(e);
    return {
      ts,
      summary: b.summary,
      ...(b.geo.country ? { country: b.geo.country } : {}),
      ...(devStamp ? { dev: devStamp } : {}),
      ...(b.page ? { page: b.page } : {}),
      ...(mergedEvents.length ? { events: mergedEvents } : {}),
      ...(cards ? { cards } : {}),
    };
  };

  const log = rec.sessionLog;
  const ms = alignSessionMs(log.length, rec.sessionMs);

  if (!retiredCapture(existing ?? {},b.now,Math.min(...oldSpans.map(s=>s.start)),LEAGUE_SESSION_GAP_MS)) {
    if (log.length === 0) {
      log.push(makeEntry(b.now, b.cards));
      ms.push(0);
    } else {
      const target = sessionTarget(
        log.map((s) => s.ts),
        ms,
        b.now,
        LEAGUE_SESSION_GAP_MS,
      );

      if (
        target.kind === 'insert' &&
        !b.capturedKnown &&
        existing &&
        b.cards &&
        rec.latestCards &&
        isSubsetRegression(memberIds(b.cards), memberIds(rec.latestCards))
      ) {
        if (b.now > rec.lastTs) {
          rec.lastTs = b.now;
          rec.lastAt = at;
        }
        rec.sessionMs = ms;
        rec.sessionLog = log;
        Object.assign(rec,checkpointRecording(existing ?? {},oldSpans,endStampedSpans(rec),b.now,b.receivedAt ?? b.now));
        return rec;
      }

      if (target.kind === 'join') {
        const i = target.index;
        if (b.now >= log[i].ts) {
          const start = log[i].ts - ms[i];
          const newEnd = Math.max(log[i].ts, b.now);
          ms[i] = Math.max(0, newEnd - start);
          log[i] = makeEntry(newEnd, b.cards ?? log[i].cards, log[i]);
        }
      } else {
        log.splice(target.index, 0, makeEntry(b.now, b.cards));
        ms.splice(target.index, 0, 0);
        rec.sessions += 1;
      }
    }
  }

  const overflow = log.length - LEAGUE_MAX_SESSIONS;
  const retiredThrough = overflow > 0 ? Math.max(...log.slice(0,overflow).map(s=>s.ts)) : undefined;
  Object.assign(rec,checkpointRecording(existing ?? {},oldSpans,endStampedSpans({sessionLog:log,sessionMs:ms}),b.now,b.receivedAt ?? b.now,retiredThrough));
  rec.sessionLog = overflow > 0 ? log.slice(overflow) : log;
  rec.sessionMs = overflow > 0 ? ms.slice(overflow) : ms;
  rec.maxSessionMs = rec.sessionMs.reduce((m, n) => Math.max(m, n), rec.maxSessionMs);

  if (b.now >= rec.lastTs) {
    rec.lastTs = b.now;
    rec.lastAt = at;
    rec.latest = b.summary;
    if (b.cards) rec.latestCards = b.cards;
    const last = rec.sessionLog.length - 1;
    rec.curSessionStart = rec.sessionLog[last].ts - rec.sessionMs[last];
  } else {
    rec.firstTs = Math.min(rec.firstTs, b.now);
    rec.firstAt = new Date(rec.firstTs).toISOString();
  }

  return rec;
}

export function parseLeagueRecord(raw: unknown): LeagueRecord | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return parseLeagueRecord(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  return sanitizeRecordingFields(raw as LeagueRecord);
}
