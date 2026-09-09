/**
 * The gym leader maker's per-browser record, and the pure merge that builds
 * it from one beacon. Mirrors the dex builder's ClientRecord (see _shared.ts)
 * in shape and in sessionization, so the dashboard reads both the same way
 * and a person who uses both tools is the intersection of two hashes.
 *
 * Nothing here touches Redis, so src/lib/leagueRecord.test.ts can drive it.
 * league.ts owns the endpoint. The leading underscore keeps Vercel from
 * serving this file as a route.
 */

/** A quiet gap longer than this between two beacons starts a new session. */
export const LEAGUE_SESSION_GAP_MS = 30 * 60_000;
/** Keep at most this many sessions per record (most recent wins). */
export const LEAGUE_MAX_SESSIONS = 50;

export const LEAGUE_CLIENTS_KEY = 'league:clients';
export const LEAGUE_VERSION_KEY = 'league:clients:ver';

export const LEAGUE_BEACON_KINDS = ['progress', 'export'] as const;
export type LeagueBeaconKind = (typeof LEAGUE_BEACON_KINDS)[number];
export const LEAGUE_EXPORT_KINDS = ['card', 'league'] as const;
export type LeagueExportKind = (typeof LEAGUE_EXPORT_KINDS)[number];

/**
 * What a league looks like at one moment, in counts. Intent only, like the
 * store: no card contents, no names — those are the user's.
 */
export interface LeagueSummary {
  /** Cards (of CARD_COUNT) holding at least one evolution line. */
  cards: number;
  /** Evolution lines seated across every card. */
  seats: number;
  /** Cards with a type chosen. */
  typed: number;
  /** Cards with a badge name or a theme typed. */
  named: number;
  /** Cards with an ace (signature) marked. */
  aces: number;
  /** Whether the league itself has a name. */
  leagueNamed: boolean;
}

export interface LeagueSessionEntry {
  ts: number;
  summary: LeagueSummary;
  country?: string;
  dev?: string;
  page?: string;
}

export interface LeagueRecord {
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
  /** Deepest league ever reached: most cards with a line, most seats. */
  maxCards: number;
  maxSeats: number;
  latest: LeagueSummary;
  exportsCard: number;
  exportsLeague: number;
  exportedCardAt?: string;
  exportedLeagueAt?: string;
  country?: string;
  region?: string;
  tz?: string;
  lang?: string;
  locale?: string;
  device?: string;
  os?: string;
  browser?: string;
}

export function isLeagueBeaconKind(s: unknown): s is LeagueBeaconKind {
  return typeof s === 'string' && (LEAGUE_BEACON_KINDS as readonly string[]).includes(s);
}
export function isLeagueExportKind(s: unknown): s is LeagueExportKind {
  return typeof s === 'string' && (LEAGUE_EXPORT_KINDS as readonly string[]).includes(s);
}

/**
 * Trainer cards in a league: 8 gyms, 4 Elite Four, the champion, the endgame
 * boss.
 *
 * MUST equal `SLOT_COUNT` in src/league/model/constants.ts, which is what the
 * app actually renders. It said 11 while the app rendered 14, and parseSummary
 * clamps rather than rejects — so every league with more than 11 filled cards
 * was silently recorded as exactly 11, and its seats as 66 rather than 84.
 * src/lib/leagueRecord.test.ts pins the two together so the drift cannot
 * return quietly.
 */
export const CARD_COUNT = 14;
/** Six lines per card. */
export const SEAT_MAX = 6 * CARD_COUNT;

function clampInt(v: unknown, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(max, Math.round(v)));
}

/** Sanitize a client-sent summary; null when it is not one. */
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

export interface LeagueBeaconInput {
  cid: string;
  kind: LeagueBeaconKind;
  exportKind?: LeagueExportKind;
  summary: LeagueSummary;
  now: number;
  geo: { country?: string; region?: string; tz?: string };
  ua: { device: string; os: string; browser: string };
  lang?: string;
  locale?: string;
  page?: string;
}

/**
 * Merge one beacon into a record (or seed one). Pure given `existing`, so it
 * can be re-run after a lost CAS race, and unit-tested without Redis.
 */
export function mergeLeagueRecord(existing: LeagueRecord | null, b: LeagueBeaconInput): LeagueRecord {
  const at = new Date(b.now).toISOString();
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

  const gap = existing ? b.now - existing.lastTs : 0;
  const newSession = !existing || gap > LEAGUE_SESSION_GAP_MS;
  if (existing && newSession) {
    rec.sessions += 1;
    rec.curSessionStart = b.now;
  }
  const curSessionMs = Math.max(0, b.now - rec.curSessionStart);
  rec.maxSessionMs = Math.max(rec.maxSessionMs, curSessionMs);
  if (newSession || rec.sessionMs.length === 0) rec.sessionMs.push(curSessionMs);
  else rec.sessionMs[rec.sessionMs.length - 1] = curSessionMs;
  rec.sessionMs = rec.sessionMs.slice(-LEAGUE_MAX_SESSIONS);

  const devStamp = [b.ua.device, b.ua.os, b.ua.browser].filter((p) => p && p !== 'Unknown').join(' · ');
  const entry: LeagueSessionEntry = {
    ts: b.now,
    summary: b.summary,
    ...(b.geo.country ? { country: b.geo.country } : {}),
    ...(devStamp ? { dev: devStamp } : {}),
    ...(b.page ? { page: b.page } : {}),
  };
  if (newSession || rec.sessionLog.length === 0) rec.sessionLog.push(entry);
  else rec.sessionLog[rec.sessionLog.length - 1] = entry;
  rec.sessionLog = rec.sessionLog.slice(-LEAGUE_MAX_SESSIONS);

  rec.lastTs = b.now;
  rec.lastAt = at;
  rec.submits += 1;
  rec.latest = b.summary;
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
  rec.device = b.ua.device;
  rec.os = b.ua.os;
  rec.browser = b.ua.browser;
  return rec;
}

export function parseLeagueRecord(raw: unknown): LeagueRecord | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as LeagueRecord;
    } catch {
      return null;
    }
  }
  return raw as LeagueRecord;
}
