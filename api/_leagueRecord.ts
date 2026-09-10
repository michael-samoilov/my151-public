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

/** Lines one card may seat. */
export const SEATS_PER_CARD = 6;
/** Stages one evolution branch may have. */
const MAX_STAGES = 5;
/** Widest plausible Pokemon or powerup-form id. Shape-checked, not matched
 *  against a species list: the API has no business tracking which Pokemon the
 *  app ships, the same reason parseLocale only checks a locale's shape. */
const MAX_POKEMON_ID = 99_999;
/** Rows a card can have. Bounds `boundaries`, which name a row. */
const MAX_ROW = 20;

/**
 * One seated evolution line.
 *
 * Short keys because a progress beacon carries this on every debounced write
 * and Redis stores it per browser.
 */
export interface LeagueLineShape {
  /** Member ids, base form first. One branch of a chain, never a whole tree. */
  b: number[];
  /**
   * Per stage, the first row it may appear in — present ONLY when the user
   * dragged a stage away from the level curve's default.
   *
   * Its absence is the fact worth recording: it means the line evolves where
   * the curve put it, and the client is the only place that knows the default.
   */
  bd?: number[];
}

/**
 * One trainer card's structure. No typed text: the badge name, the theme and
 * the league name stay in the browser, because free text is where a person
 * puts things about themselves. `named` in the summary still counts them.
 */
export interface LeagueCardShape {
  /** Slot index, 0-based, in league order. */
  i: number;
  /** Card type, or 'none'. Absent when the user has not chosen one. */
  t?: string;
  /** Seated lines. */
  l: LeagueLineShape[];
  /** Seat carrying the ace mark. */
  ace?: number;
  /** The line member picked as the ace, when the user picked one. */
  aceId?: number;
  /** The partner sharing the ace's slot. */
  pa?: number;
  /** The card's TM move. */
  tm?: number;
  /** Legendaries on the endgame row, as [seat, pokemonId]. */
  lg?: [number, number][];
  /** Powerups, as [row, seat, formIndex, 0 for mega or 1 for dynamax]. */
  pw?: [number, number, number, number][];
}

export interface LeagueSessionEntry {
  ts: number;
  summary: LeagueSummary;
  country?: string;
  dev?: string;
  page?: string;
  /** The league's structure at this session's last beacon: the same shape as
   *  `latestCards`, kept per session so the admin scrubber can replay the board
   *  at a past point, not only its counts. Absent on sessions logged before the
   *  field existed, and on any beacon that carried no structure. Bounded by
   *  LEAGUE_MAX_SESSIONS like the rest of the log; a full 14-card league is a
   *  few KB, so a record with many sessions grows accordingly. */
  cards?: LeagueCardShape[];
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
  /**
   * The structure of the user's current league: which lines sit on which
   * card, which stages they dragged, their powerups and legendaries.
   *
   * Latest only, the way ClientRecord keeps `latestIds` — a per-session copy
   * would multiply the record by its session count for a view that only ever
   * asks "what does their league look like". Absent on every record written
   * before the field existed, and on any beacon that omits it.
   */
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
  device?: string;
  os?: string;
  browser?: string;
  /** Host of the external site that first linked this browser here — a coarse
   *  acquisition source, set once and never overwritten (forward-only), host
   *  only. Mirrors ClientRecord.firstReferrer so a cross-tool browser reports
   *  one acquisition source whichever tool it first hit. Absent on direct
   *  visits, internal navigation, and legacy records. */
  firstReferrer?: string;
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

/** A positive integer id within `max`, or null. */
function idOrNull(v: unknown, max: number): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > max) return null;
  return v;
}

/** An integer in [lo, hi], or null. */
function intInRange(v: unknown, lo: number, hi: number): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) return null;
  return v;
}

/**
 * Sanitize the card structure a client sent.
 *
 * Every field is bounded and every malformed part is dropped rather than
 * rejecting the whole beacon: the summary counts beside it are still worth
 * recording when one card arrives mangled. Returns undefined when the beacon
 * carried no structure at all, which `mergeLeagueRecord` treats as "leave what
 * is stored alone" — distinct from an empty array, which means an empty league.
 */
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
          // Only a complete set of boundaries describes the line; a partial
          // one would say a stage moved without saying where to.
          if (bd.length === branch.length) line.bd = bd;
        }
        lines.push(line);
      }
    }

    const card: LeagueCardShape = { i, l: lines };
    // A type name, shape-checked and bounded. Never matched against a type
    // list: which types the app ships is not the API's business.
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
      const lg: [number, number][] = [];
      for (const pair of c.lg.slice(0, SEATS_PER_CARD)) {
        if (!Array.isArray(pair)) continue;
        const seat = intInRange(pair[0], 1, SEATS_PER_CARD);
        const id = idOrNull(pair[1], MAX_POKEMON_ID);
        if (seat !== null && id !== null) lg.push([seat, id]);
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
  page?: string;
  /** External referrer host, host-only, already validated. Stored forward-only. */
  referrer?: string;
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
  // Carry the session's structure forward when a within-session beacon omits it
  // (an export beacon can), the same reason the dex log carries events forward:
  // rewriting the last entry must not blank a board an earlier beacon captured.
  const prevCards =
    !newSession && rec.sessionLog.length > 0 ? rec.sessionLog[rec.sessionLog.length - 1].cards : undefined;
  const sessionCards = b.cards ?? prevCards;
  const entry: LeagueSessionEntry = {
    ts: b.now,
    summary: b.summary,
    ...(b.geo.country ? { country: b.geo.country } : {}),
    ...(devStamp ? { dev: devStamp } : {}),
    ...(b.page ? { page: b.page } : {}),
    ...(sessionCards ? { cards: sessionCards } : {}),
  };
  if (newSession || rec.sessionLog.length === 0) rec.sessionLog.push(entry);
  else rec.sessionLog[rec.sessionLog.length - 1] = entry;
  rec.sessionLog = rec.sessionLog.slice(-LEAGUE_MAX_SESSIONS);

  rec.lastTs = b.now;
  rec.lastAt = at;
  rec.submits += 1;
  rec.latest = b.summary;
  // Only when the beacon carried one: a client that sends no structure must
  // not erase the structure an earlier beacon stored.
  if (b.cards) rec.latestCards = b.cards;
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
  // Acquisition source, set once and never overwritten (forward-only).
  if (b.referrer && !rec.firstReferrer) rec.firstReferrer = b.referrer;
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
