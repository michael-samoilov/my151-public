import {parseFavoriteRecord, type FavoriteRecord} from './_favoriteRecord.js';
import {favoritePicks, favoriteSummary, favoriteUsageFunnel, favoriteUser} from './_favoriteAggregate.js';
// The admin dashboard payload, computed from the raw Redis reads in
// api/submissions.ts. It reads no Redis and no request, and it takes the
// clock as an argument.
import { parseRecord, type ClientRecord } from './_shared.js';
import { EVOLUTION_CHAIN_BY_ID } from './_chains.js';
import {
  parseExportSurveySkipMap,
  stampExportSurveySkips,
  type ExportSurveySkip,
} from './_events.js';
import {
  CARD_COUNT,
  parseLeagueRecord,
  peakFullGyms,
  type LeagueRecord,
} from './_leagueRecord.js';
import {
  DAY_MS,
  aggregate,
  browserTotal,
  buildDepthCurve,
  dayStart,
  depthByDevice,
  endStampedUsage,
  lastPointLabelCounts,
  mergeByCid,
  quantile,
  referrerFlow,
  sessionSeconds,
  spanUsage,
  tallyCohort,
  dexUsageFunnel,
  leagueUsageFunnel,
  funnelEventCount,
  type Aggregates,
  type Cohort,
  type DexFunnelRow,
  type SessionRecord,
  type ToolUsage,
} from './_aggregate.js';
import { asArchivedSet, bareCid, isArchived, withoutArchived } from './_archive.js';
import { TOOL_CATALOG, buildCrossTool, sinceLaunchStarts, type CrossToolSnapshot } from './_crossTool.js';
import { leaguePicks } from './_leaguePicks.js';
import { activeSince, firstSeenSince, rangeStart, type DashboardRange } from './_range.js';
/** Distinct evolution lines represented by a set of ids (unknown ids count as
 *  their own line). Mirrors the client's countEvoLines so server-derived depth
 *  matches what the beacon reports. */
function countEvoLines(ids: number[]): number {
  const chains = new Set<number>();
  for (const id of ids) chains.add(EVOLUTION_CHAIN_BY_ID[id] ?? -id);
  return chains.size;
}

/** Pokémon count at the end of each session. A record with no session log
 *  has one: its current build. */
function monEndsOf(r: ClientRecord): number[] {
  return r.sessionLog?.map((s) => (s.ids ?? []).length) ?? [r.latestIds?.length ?? 0];
}

/** Earliest beacon per browser, keyed by the bare cid so a country-split dex
 *  record still matches its league record. */
function firstTsByCid(records: { cid: string; firstTs: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of records) {
    const cid = bareCid(r.cid);
    out.set(cid, Math.min(out.get(cid) ?? Infinity, r.firstTs));
  }
  return out;
}

// Date the onboarding suite (intro card + milestone progress bar + funnel
// beacons) shipped to prod — deploy-branch merge on 2026-07-08 (commit
// f5f4e55). The pre/post cohort slider defaults here. Update if it's re-dated.
const ONBOARDING_LAUNCH_TS = Date.UTC(2026, 6, 8); // 2026-07-08 UTC (month is 0-based)

// Per-minute time-before-churn bars up to this cap; everything longer (incl.
// returning users who came back another day) falls in the final overflow bar.
/** Ranked entries (desc) including only those with count >= min. No hard cap,
 *  so evolution lines are never truncated mid-family. */
function rankedAtLeast(counts: Record<string, number>, min: number): [string, number][] {
  return Object.entries(counts)
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1]);
}

/** Self-scaling qualification threshold: the MEAN per-Pokemon count. For a
 *  long-tailed distribution the head pulls the mean above the median, so
 *  "appears in >= the average number of dexes" naturally cuts the sparse tail
 *  without a hand-picked constant. Floored at 2 (a single-dex Pokemon is tail
 *  by definition) and rounded up. */
function tailThreshold(counts: Record<string, number>): number {
  const v = Object.values(counts);
  if (v.length === 0) return 2;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.max(2, Math.ceil(mean));
}

/** Apply rankedAtLeast within each section, dropping sections left empty. */
function rankBySection(
  bySection: Record<string, Record<string, number>>,
  min: number,
): Record<string, [string, number][]> {
  const out: Record<string, [string, number][]> = {};
  for (const [sid, counts] of Object.entries(bySection)) {
    const ranked = rankedAtLeast(counts, min);
    if (ranked.length > 0) out[sid] = ranked;
  }
  return out;
}

/** Rank within each section against that section's OWN mean, not the global
 *  one. Using the global threshold front-loads early-route Pokemon: incomplete
 *  dexes over-represent them, so they dominate the global mean and later
 *  sections get cut too hard. A per-section threshold shows what was popular
 *  within each section on its own terms. */
function rankBySectionSelf(
  bySection: Record<string, Record<string, number>>,
): Record<string, [string, number][]> {
  const out: Record<string, [string, number][]> = {};
  for (const [sid, counts] of Object.entries(bySection)) {
    const ranked = rankedAtLeast(counts, tailThreshold(counts));
    if (ranked.length > 0) out[sid] = ranked;
  }
  return out;
}

/** UTC Monday (ms) of the week a timestamp falls in. Weeks, not days, because
 *  a per-day crossover rate on this traffic is mostly noise. */
function weekStart(ts: number): number {
  const day = dayStart(ts);
  const dow = new Date(day).getUTCDay(); // 0 = Sunday
  return day - ((dow + 6) % 7) * DAY_MS;
}

/** Where a browser's two tools sit relative to each other. `same-day` covers
 *  the common case of finding the second tool from the first one's page. */
export type ToolOrder = 'dex-first' | 'league-first' | 'same-day';

function toolOrder(dexFirstTs: number, leagueFirstTs: number): ToolOrder {
  const gap = leagueFirstTs - dexFirstTs;
  if (Math.abs(gap) < DAY_MS) return 'same-day';
  return gap > 0 ? 'dex-first' : 'league-first';
}

/**
 * One browser's league record, as the per-user cards read it.
 *
 * Serves two places: attached to a dex user's card, where `order` says which
 * tool they met first, and as a card of its own under the League slice, where
 * a browser that never touched the dex builder still has to be visible.
 */
interface LeagueUser {
  cid: string;
  firstTs: number;
  firstAt: string;
  lastTs: number;
  lastAt: string;
  submits: number;
  sessions: number;
  maxSessionMs: number;
  sessionMs: number[];
  maxCards: number;
  maxSeats: number;
  latest: LeagueRecord['latest'];
  /** The structure of their current league. Absent until they send a beacon
   *  from a build that carries it — nothing backfills an older record. */
  latestCards?: LeagueRecord['latestCards'];
  exportsCard: number;
  exportsLeague: number;
  exportedCardAt?: string;
  exportedLeagueAt?: string;
  exportSurveySkips?: ExportSurveySkip[];
  /** Each session's end state, so the card can diff visit to visit. */
  sessionLog: LeagueRecord['sessionLog'];
  country?: string;
  region?: string;
  tz?: string;
  lang?: string;
  locale?: string;
  switched?: string;
  device?: string;
  os?: string;
  browser?: string;
  /** Coarse acquisition source (external referrer host), forward-only. */
  firstReferrer?: string;
  /** Whether this browser also has a dex record. */
  hasDex: boolean;
  /** True when this browser is archived and dropped from aggregates. */
  archived?: boolean;
  /** Absent when this browser has no dex record to be ordered against. */
  order?: ToolOrder;
  /** Signed days from the first dex beacon to the first league one. */
  gapDays?: number;
}

function leagueUser(r: LeagueRecord, dexFirstTs?: number): LeagueUser {
  return {
    cid: r.cid,
    firstTs: r.firstTs,
    firstAt: r.firstAt,
    lastTs: r.lastTs,
    lastAt: r.lastAt,
    submits: r.submits,
    sessions: r.sessions,
    maxSessionMs: r.maxSessionMs,
    sessionMs: r.sessionMs,
    maxCards: r.maxCards,
    maxSeats: r.maxSeats,
    latest: r.latest,
    latestCards: r.latestCards,
    exportsCard: r.exportsCard,
    exportsLeague: r.exportsLeague,
    exportedCardAt: r.exportedCardAt,
    exportedLeagueAt: r.exportedLeagueAt,
    sessionLog: r.sessionLog,
    country: r.country,
    region: r.region,
    tz: r.tz,
    lang: r.lang,
    locale: r.locale,
    switched: r.switched,
    device: r.device,
    os: r.os,
    browser: r.browser,
    firstReferrer: r.firstReferrer,
    hasDex: dexFirstTs !== undefined,
    ...(dexFirstTs !== undefined
      ? {
          order: toolOrder(dexFirstTs, r.firstTs),
          gapDays: Math.round(((r.firstTs - dexFirstTs) / DAY_MS) * 10) / 10,
        }
      : {}),
  };
}

export interface Journeys {
  /** Browsers with a record in both stores. */
  both: number;
  dexFirst: number;
  leagueFirst: number;
  sameDay: number;
  /** Days between the two first beacons, ignoring direction. */
  medianGapDays: number;
  p75GapDays: number;
  /** Per UTC week: how many browsers each tool gained, and how many of them
   *  opened the other tool within 7 days of that first beacon. */
  weekly: {
    week: number;
    newDex: number;
    dexToLeague7d: number;
    newLeague: number;
    leagueToDex7d: number;
  }[];
}

/**
 * The number the launch was for: does one tool feed the other?
 *
 * Read from `firstTs` in both stores, so it reaches back to each tool's first
 * beacon. "Within 7 days" is deliberately one-directional — a browser counts
 * as converted only when the second tool's first beacon comes AFTER the
 * first tool's and inside the window. Someone who already used both before
 * the week in question is not a conversion.
 */
function crossToolJourneys(dexFirst: Map<string, number>, leagueFirst: Map<string, number>): Journeys {
  const gaps: number[] = [];
  let dexFirstCount = 0;
  let leagueFirstCount = 0;
  let sameDay = 0;
  for (const [cid, dts] of dexFirst) {
    const lts = leagueFirst.get(cid);
    if (lts === undefined) continue;
    gaps.push(Math.abs(lts - dts) / DAY_MS);
    const order = toolOrder(dts, lts);
    if (order === 'same-day') sameDay += 1;
    else if (order === 'dex-first') dexFirstCount += 1;
    else leagueFirstCount += 1;
  }
  gaps.sort((a, b) => a - b);

  const weeks = new Map<number, { newDex: number; dexToLeague7d: number; newLeague: number; leagueToDex7d: number }>();
  const week = (ts: number) => {
    const k = weekStart(ts);
    let w = weeks.get(k);
    if (!w) weeks.set(k, (w = { newDex: 0, dexToLeague7d: 0, newLeague: 0, leagueToDex7d: 0 }));
    return w;
  };
  const crossed = (from: number, to: number | undefined) =>
    to !== undefined && to >= from && to - from <= 7 * DAY_MS;
  for (const [cid, dts] of dexFirst) {
    const w = week(dts);
    w.newDex += 1;
    if (crossed(dts, leagueFirst.get(cid))) w.dexToLeague7d += 1;
  }
  for (const [cid, lts] of leagueFirst) {
    const w = week(lts);
    w.newLeague += 1;
    if (crossed(lts, dexFirst.get(cid))) w.leagueToDex7d += 1;
  }

  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    both: gaps.length,
    dexFirst: dexFirstCount,
    leagueFirst: leagueFirstCount,
    sameDay,
    medianGapDays: round1(quantile(gaps, 0.5)),
    p75GapDays: round1(quantile(gaps, 0.75)),
    weekly: [...weeks.entries()]
      .map(([week, v]) => ({ week, ...v }))
      .sort((a, b) => a.week - b.week),
  };
}

/** The Redis reads the dashboard is computed from, as the SDK returns them. */
export interface DashboardSource {
  clients: Record<string, unknown> | null;
  archived: unknown;
  funnel: Record<string, unknown> | null;
  /** The per-day funnel counters of the range's cohort window, summed. `null`
   *  when the funnels read the all-time `funnel` hash (see funnelDayKeys). */
  funnelWindow: Record<string, unknown> | null;
  leagueClients: Record<string, unknown> | null;
  favoriteClients?: Record<string, unknown> | null;
}

/** A counter hash as numbers, skipping any field that is not one. */
function counts(hash: Record<string, unknown> | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(hash ?? {})) {
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

/** One tool of a browser, as its Newest browsers row shows it. */
export interface ToolStat {
  /** Progress: Pokémon in the Dex, Gyms with a line, or filled Picker cells. */
  count: number;
  /** Present once the tool exported. */
  exported?: true;
  /** Every session the tool counted, and their summed time. */
  sessions: number;
  totalMs: number;
}

/**
 * One record on a Newest browsers list: what its row shows and filters on.
 * The who fields and the time are the list record's own; the tools are every
 * tool of its browser. A tool the browser never used is absent.
 */
export interface BrowserRow {
  cid: string;
  lastTs: number;
  tz?: string;
  country?: string;
  region?: string;
  device?: string;
  os?: string;
  browser?: string;
  lang?: string;
  locale?: string;
  switched?: string;
  archived: boolean;
  dex?: ToolStat;
  league?: ToolStat;
  picker?: ToolStat;
  /** The browser as a whole: sessions merged across tools, time counted once. */
  total: { sessions: number; totalMs: number };
}

/** Every record of each tool, newest-active first. */
export interface BrowserIndex {
  dex: BrowserRow[];
  league: BrowserRow[];
  picker: BrowserRow[];
}

/** What a row reads from each tool's record. A stored record and the shaped
 *  user the admin page holds both satisfy these. */
type Sessions = { sessions?: number; sessionMs?: number[] };
type DexTool = Sessions & { latestIds?: number[]; exported?: boolean; sessionLog?: { ts: number }[] };
type LeagueTool = Sessions & { maxCards: number; exportsCard: number; exportsLeague: number; sessionLog?: { ts: number }[] };
type PickerTool = Sessions & {
  latest: { filled: number };
  exportsFull: number;
  exportsSimplified: number;
  sessionLog?: { ts: number; endTs: number }[];
};

function toolStat(count: number, exported: boolean, usage: ToolUsage): ToolStat {
  return { count, ...(exported ? { exported: true as const } : {}), sessions: usage.sessions, totalMs: usage.totalMs };
}

/** One list record's row, with the tools of its browser. */
export function browserRow(
  rec: SessionRecord,
  tools: { dex?: DexTool; league?: LeagueTool; picker?: PickerTool },
  archived: boolean,
): BrowserRow {
  const { dex, league, picker } = tools;
  const dexUsage = dex && endStampedUsage(dex);
  const leagueUsage = league && endStampedUsage(league);
  const pickerUsage = picker && spanUsage(picker);
  return {
    cid: rec.cid,
    lastTs: rec.lastTs,
    tz: rec.tz,
    country: rec.country,
    region: rec.region,
    device: rec.device,
    os: rec.os,
    browser: rec.browser,
    lang: rec.lang,
    locale: rec.locale,
    switched: rec.switched,
    archived,
    dex: dex && dexUsage && toolStat(dex.latestIds?.length ?? 0, !!dex.exported, dexUsage),
    league: league && leagueUsage && toolStat(league.maxCards, league.exportsCard + league.exportsLeague > 0, leagueUsage),
    picker: picker && pickerUsage && toolStat(picker.latest.filled, picker.exportsFull + picker.exportsSimplified > 0, pickerUsage),
    total: browserTotal([dexUsage, leagueUsage, pickerUsage].filter((u): u is ToolUsage => !!u)),
  };
}

/**
 * The Newest browsers lists: every record of each tool, archived ones
 * flagged. A country-split Dex record (`<cid>::<country>`) is a row of its
 * own; the League and Picker rows of its browser read the browser's own Dex
 * record, or its newest split when it has none.
 */
export function browserIndex(
  dex: (SessionRecord & DexTool)[],
  league: (SessionRecord & LeagueTool)[],
  picker: (SessionRecord & PickerTool)[],
  archived: Set<string>,
): BrowserIndex {
  const newest = <T extends { lastTs: number }>(list: T[]) => [...list].sort((a, b) => b.lastTs - a.lastTs);
  const dexRows = newest(dex);
  const dexOf = new Map<string, SessionRecord & DexTool>();
  for (const r of dexRows) if (r.cid === bareCid(r.cid) || !dexOf.has(bareCid(r.cid))) dexOf.set(bareCid(r.cid), r);
  const leagueOf = new Map(league.map((r) => [bareCid(r.cid), r]));
  const pickerOf = new Map(picker.map((r) => [bareCid(r.cid), r]));
  const row = (rec: SessionRecord, own: { dex?: DexTool; league?: LeagueTool; picker?: PickerTool }) => {
    const cid = bareCid(rec.cid);
    const tools = { dex: dexOf.get(cid), league: leagueOf.get(cid), picker: pickerOf.get(cid), ...own };
    return browserRow(rec, tools, isArchived(rec.cid, archived));
  };
  return {
    dex: dexRows.map((r) => row(r, { dex: r })),
    league: newest(league).map((r) => row(r, { league: r })),
    picker: newest(picker).map((r) => row(r, { picker: r })),
  };
}

/**
 * The `/api/submissions` payload.
 *
 * `range` picks the browsers each card counts. Most cards count the browsers
 * active in the range. Cross-tool cards keep both tools' records of those
 * browsers. The funnels and the referrer flow count the browsers first seen
 * in the range, and the funnels open on the window's day counters. The
 * activity series and the browser index keep every browser.
 */
export function buildDashboard(source: DashboardSource, { range }: { range: DashboardRange }, now: number) {
  const allRecords: ClientRecord[] = Object.values(source.clients ?? {})
    .map(parseRecord)
    .filter((r): r is ClientRecord => r !== null);
  const archivedSet = asArchivedSet(source.archived);
  // Aggregates skip archived browsers. The browser index still carries them,
  // flagged, so the admin can open or un-archive a card.
  const records = withoutArchived(allRecords, archivedSet);

  // Funnel event counters (from api/event.ts) — top-of-funnel signals that
  // fire with zero placements, so they live outside the per-user records.
  const funnelEvents = counts(source.funnel);
  const cohortEvents = source.funnelWindow ? counts(source.funnelWindow) : funnelEvents;

  // The gym leader maker's records, in their own hash. A person who used
  // both tools is one cid present in both, so overlap is a set
  // intersection at read time — retroactive by construction.
  const allLeagueRecords: LeagueRecord[] = Object.values(source.leagueClients ?? {})
    .map(parseLeagueRecord)
    .filter((r): r is LeagueRecord => r !== null);
  const leagueRecords = withoutArchived(allLeagueRecords, archivedSet);

  const allFavoriteRecords = Object.values(source.favoriteClients ?? {}).map(parseFavoriteRecord).filter((r): r is FavoriteRecord => r !== null);
  const favoriteRecords = withoutArchived(allFavoriteRecords, archivedSet);

  // For `all`, every card reads the same arrays it read before ranges existed.
  const start = rangeStart(range, now);
  const within = <T>(list: T[], keep: (r: T) => boolean): T[] => (start === null ? list : list.filter(keep));
  const active = (r: SessionRecord) => activeSince(r, start);
  const dexIn = within(records, active);
  const leagueIn = within(leagueRecords, active);
  const favoriteIn = within(favoriteRecords, active);
  const favoriteNew = within(favoriteRecords, (r) => firstSeenSince(r, start));
  // Cross-tool cards: every record, of any tool, of the browsers active after `from`.
  const crossWindow = (from: number | null) => {
    const keep = <T>(list: T[], test: (r: T) => boolean): T[] => (from === null ? list : list.filter(test));
    const on = (r: SessionRecord) => activeSince(r, from);
    const cids = new Set([...keep(records, on), ...keep(leagueRecords, on), ...keep(favoriteRecords, on)].map((r) => bareCid(r.cid)));
    return {
      dex: keep(records, (r) => cids.has(bareCid(r.cid))),
      league: keep(leagueRecords, (r) => cids.has(r.cid)),
      favorite: keep(favoriteRecords, (r) => cids.has(bareCid(r.cid))),
    };
  };
  const { dex: crossDex, league: crossLeague, favorite: crossFavorite } = crossWindow(start);
  const dexNew = within(records, (r) => firstSeenSince(r, start));
  const leagueNew = within(leagueRecords, (r) => firstSeenSince(r, start));

  const dexCids = new Set(dexIn.map((r) => r.cid.split('::')[0]));
  const leagueCids = new Set(leagueIn.map((r) => r.cid));
  const both = [...leagueCids].filter((c) => dexCids.has(c));
  const dexExporters = dexIn.filter((r) => r.exported).map((r) => r.cid.split('::')[0]);
  const leagueExporters = leagueIn.filter((r) => r.exportsCard + r.exportsLeague > 0).map((r) => r.cid);
  const tools = {
    dex: dexCids.size,
    league: leagueCids.size,
    both: both.length,
    leagueOnly: leagueCids.size - both.length,
    dexOnly: dexCids.size - both.length,
    dexExporters: dexExporters.length,
    dexExportersWhoOpenedLeague: dexExporters.filter((c) => leagueCids.has(c)).length,
    leagueExporters: leagueExporters.length,
    leagueExportersWithDex: leagueExporters.filter((c) => dexCids.has(c)).length,
  };
  const dexFirstTs = firstTsByCid(records);
  const journeys = crossToolJourneys(firstTsByCid(crossDex), firstTsByCid(crossLeague));
  const crossTool = buildCrossTool(crossDex, crossLeague, undefined, crossFavorite);
  // The same snapshot per later tool, with the window opening no earlier than
  // its launch. Built from the records already read: no Redis command.
  const crossToolSince: Record<string, CrossToolSnapshot> = {};
  for (const { id, start: from } of sinceLaunchStarts(TOOL_CATALOG, start)) {
    const w = crossWindow(from);
    crossToolSince[id] = buildCrossTool(w.dex, w.league, undefined, w.favorite);
  }

  // The league funnel, from the records: opened is a record at all (the
  // first beacon needs a seated line), then named, then exported.
  const leagueDaily: Record<number, Set<string>> = {};
  for (const r of leagueRecords) {
    for (const s of r.sessionLog) {
      const day = Math.floor(s.ts / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000);
      (leagueDaily[day] ??= new Set()).add(r.cid);
    }
  }
  const league = {
    users: leagueIn.length,
    named: leagueIn.filter((r) => r.latest.named > 0).length,
    typed: leagueIn.filter((r) => r.latest.typed > 0).length,
    fullLeague: leagueIn.filter((r) => r.maxCards >= CARD_COUNT).length,
    returning: leagueIn.filter((r) => r.sessions > 1).length,
    activity: Object.entries(leagueDaily)
      .map(([day, set]) => ({ day: Number(day), dau: set.size }))
      .sort((a, b) => a.day - b.day),
    picks: leaguePicks(leagueIn),
    recent: leagueRecords
      .sort((a, b) => b.lastTs - a.lastTs)
      .slice(0, 50)
      .map((r) => ({
        cid: r.cid,
        firstAt: r.firstAt,
        lastAt: r.lastAt,
        sessions: r.sessions,
        maxSessionMs: r.maxSessionMs,
        latest: r.latest,
        exportsCard: r.exportsCard,
        exportsLeague: r.exportsLeague,
        country: r.country,
        device: r.device,
        hasDex: dexFirstTs.has(r.cid),
      })),
  };

  // Depth (evolution-line) drop-off, four bases:
  //  total   = peak lines ever reached (overall breadth) — the default view.
  //  first   = lines net-added in the user's FIRST session.
  //  longest = lines net-added in the user's longest-DURATION session.
  //  all     = lines net-added per session, pooled (one point per session).
  // Per-session contribution = diff of cumulative end-depths, floored at 0
  // (a session that net-pruned counts as 0 added, not negative).
  // Two metrics, same four bases: evolution lines and raw Pokemon count.
  const lineVals = { total: [] as number[], first: [] as number[], longest: [] as number[], all: [] as number[] };
  const monVals = { total: [] as number[], first: [] as number[], longest: [] as number[], all: [] as number[] };
  const picksFinal: Record<string, number> = {}; // one vote per user's final dex
  const droppedCounts: Record<string, number> = {}; // ever placed but not in final dex
  // Same, but split by the section the user actually placed each Pokemon in
  // (sectionId -> { pokemonId -> count }). Forward-only; only records with
  // section placement contribute.
  const picksBySection: Record<string, Record<string, number>> = {};
  const droppedBySection: Record<string, Record<string, number>> = {};
  const bump = (m: Record<string, Record<string, number>>, sid: string, id: number) => {
    (m[sid] ??= {})[id] = (m[sid][id] ?? 0) + 1;
  };

  let completed = 0;
  let exported = 0;
  let multiSession = 0; // users with 2+ sessions (why the bases can differ)
  // Compact per-user cohort samples for the pre/post date comparison: one
  // tuple per user [firstTs, peakMon, peakLines, completed(0/1), exported(0/1)].
  // firstTs + peakMon predate onboarding, so the whole history is comparable.
  const cohort: [number, number, number, 0 | 1, 0 | 1][] = [];
  // Peak Pokemon count per record, paired with its device, for the
  // depth-by-device survival curves. This is the exact same value
  // monVals.total collects, so depthByDevice's `all` matches the existing
  // total curve.
  const monPeakEntries: { device?: string; value: number }[] = [];
  // Tally the View settings exporters actually used (forward-only — only
  // exports captured since settings-tracking shipped contribute).
  const exportSettingsAgg = {
    tracked: 0,
    outlines: 0,
    groupSpecial: 0,
    showStats: 0,
    sorts: {} as Record<string, number>,
  };

  for (const r of dexIn) {
    const sessSecs = sessionSeconds(r);
    // Index of this user's longest-DURATION session (aligns with the time
    // chart's "longest"); used to pick that session's build contribution.
    let li = 0;
    for (let i = 1; i < sessSecs.length; i++) if (sessSecs[i] > sessSecs[li]) li = i;

    // Per-session END sizes (cumulative) for each metric. Prefer stored evo-
    // line end depths; otherwise BACK-POPULATE from sessionLog (each entry has
    // that session's ids). Pokemon count comes straight from those ids.
    const logCounts = r.sessionLog?.map((s) => countEvoLines(s.ids ?? []));
    const lineEnds =
      r.sessionDepth && r.sessionDepth.length > 0 ? r.sessionDepth : (logCounts ?? [r.maxDepth]);
    const monEnds = monEndsOf(r);

    // total = peak size ever; first/longest/all = size ADDED per session
    // (diff of cumulative ends, floored at 0), keyed to the same longest idx.
    const fill = (target: typeof lineVals, ends: number[]) => {
      const added = ends.map((d, i) => Math.max(0, i === 0 ? d : d - ends[i - 1]));
      target.total.push(Math.max(...ends));
      target.first.push(added[0]);
      target.longest.push(added[Math.min(li, added.length - 1)]);
      for (const a of added) target.all.push(a);
    };
    fill(lineVals, lineEnds);
    fill(monVals, monEnds);
    if (Math.max(lineEnds.length, monEnds.length) >= 2) multiSession += 1;

    // Cohort sample for the pre/post date slider. Peak raw-Pokemon count (the
    // milestone threshold basis, 25/100/151) and peak evo lines, both derived
    // from history so pre-onboarding users are included.
    const peakMon = Math.max(0, ...monEnds);
    const peakLines = Math.max(0, ...lineEnds);
    cohort.push([r.firstTs, peakMon, peakLines, r.completed ? 1 : 0, r.exported ? 1 : 0]);
    monPeakEntries.push({ device: r.device, value: peakMon });

    // Popularity across every user's final/current dex (one vote each), so it
    // reflects everyone — not just the few who finish a full 151.
    for (const id of r.latestIds ?? []) picksFinal[id] = (picksFinal[id] ?? 0) + 1;
    if (r.completed) completed += 1;

    // Adjustment signal: placed at some point but not kept in the final dex.
    const kept = new Set(r.latestIds ?? []);
    for (const id of r.everIds ?? []) {
      if (!kept.has(id)) droppedCounts[id] = (droppedCounts[id] ?? 0) + 1;
    }

    // Per-section breakdowns (forward-only; needs captured placement).
    if (r.latestSections) {
      for (const [sid, sIds] of Object.entries(r.latestSections)) {
        for (const id of sIds) bump(picksBySection, sid, id);
      }
    }
    if (r.everSections) {
      for (const [sid, everIds] of Object.entries(r.everSections)) {
        const keptHere = new Set(r.latestSections?.[sid] ?? []);
        for (const id of everIds) if (!keptHere.has(id)) bump(droppedBySection, sid, id);
      }
    }
    if (r.exported) exported += 1;
    if (r.exportSettings) {
      exportSettingsAgg.tracked += 1;
      if (r.exportSettings.outlines) exportSettingsAgg.outlines += 1;
      if (r.exportSettings.groupSpecial) exportSettingsAgg.groupSpecial += 1;
      if (r.exportSettings.showStats) exportSettingsAgg.showStats += 1;
      const s = r.exportSettings.sort;
      exportSettingsAgg.sorts[s] = (exportSettingsAgg.sorts[s] ?? 0) + 1;
    }
  }

  // --- Survival (drop-off) curves -------------------------------------
  // S(t) = fraction of sessions still active at t. The steepest part of the
  // curve is where people churn — that's where to intervene. See
  // api/_aggregate.ts for how the x-axis is sampled.

  // Every record-agnostic aggregate, once per tool. `all` is one record per
  // browser with both tools' sessions merged, so a person who used both is
  // one user with one set of days — not two.
  const dexAgg = aggregate(records, now, dexIn, start);
  const leagueAgg = aggregate(leagueRecords, now, leagueIn, start);
  const favoriteAgg = aggregate(favoriteRecords, now, favoriteIn, start);
  const merged = mergeByCid([records, leagueRecords, favoriteRecords]);
  const allAgg = aggregate(merged, now, within(merged, active), start);
  const byTool: Record<'dex' | 'league' | 'favorites' | 'all', Aggregates> = {
    dex: dexAgg,
    league: leagueAgg,
    favorites: favoriteAgg,
    all: allAgg,
  };

  // Back-compat surface: the dex slice, where it has always been.
  const timeCurves = dexAgg.timeCurves;
  const timeSurvival = timeCurves.longest.survival;
  const timeStats = timeCurves.longest.stats;

  // Depth survival: x in evolution lines, 0..maxObserved.
  const curvesFor = (v: typeof lineVals) => ({
    total: buildDepthCurve(v.total),
    first: buildDepthCurve(v.first),
    longest: buildDepthCurve(v.longest),
    all: buildDepthCurve(v.all),
  });
  // Both metrics, four bases each. lineCurves = evolution lines (legacy
  // depthCurves), monCurves = raw Pokemon count (new default).
  const lineCurves = curvesFor(lineVals);
  const monCurves = curvesFor(monVals);
  const depthCurves = lineCurves; // back-compat name (evolution lines)
  // Back-compat flat surface (total lines ever reached).
  const depthSurvival = lineCurves.total.survival;
  const depthStats = lineCurves.total.stats;

  // Dex cohorts for the built/incomplete/completed toggle: same three
  // fields (users, devices, countries, browsers) tallied over three
  // non-overlapping slices of `dexIn`. No "bounced" cohort — a browser
  // that never sent a beacon has no ClientRecord, so its device, country
  // and browser are unknowable.
  const cohorts: Record<'built' | 'incomplete' | 'completed', Cohort> = {
    built: tallyCohort(dexIn),
    completed: tallyCohort(dexIn.filter((r) => r.completed === true)),
    incomplete: tallyCohort(dexIn.filter((r) => r.completed !== true)),
  };

  // Build-depth survival by device, on the same per-record peak-Pokemon
  // value monVals.total uses — `all` is that same curve, split further by
  // device for `mobile` and `desktop`.
  const depthByDeviceCurves = depthByDevice(monPeakEntries);

  // Acquisition hosts ranked by reach across both tools. Records with no
  // host count as "referrer not known" rather than dropping out.
  const referrerRows = referrerFlow(dexNew, leagueNew, favoriteNew);

  // League depth: how far a league gets, on the dex builder's pattern. Two
  // metrics, because a league can be wide (11 cards, one line each) or deep
  // (a few cards, six lines each) and the two fail differently.
  const leagueCurves = {
    cards: buildDepthCurve(leagueIn.map((r) => r.maxCards)),
    seats: buildDepthCurve(leagueIn.map((r) => r.maxSeats)),
  };

  const totalUsers = records.length;
  const dexFunnelRows: DexFunnelRow[] = dexNew.map((r) => ({
    cid: r.cid,
    peakMon: Math.max(0, ...monEndsOf(r)),
    completed: r.completed === true,
    exported: r.exported === true,
  }));
  const dexFunnel = dexUsageFunnel(dexFunnelRows, funnelEventCount(cohortEvents, 'intro-shown'));
  const leagueFunnel = leagueUsageFunnel(
    leagueNew.map((r) => ({
      maxCards: r.maxCards,
      maxSeats: r.maxSeats,
      fullGyms: peakFullGyms(r),
      exportsCard: r.exportsCard,
      exportsLeague: r.exportsLeague,
    })),
    funnelEventCount(cohortEvents, 'league-open'),
  );
  // Every browser of each tool, for the Newest browsers lists. Built from the
  // records already read, so it costs no Redis command.
  const browsers = browserIndex(allRecords, allLeagueRecords, allFavoriteRecords, archivedSet);

  // Self-scaling qualification thresholds: median per-Pokemon count per list.
  const popularMin = tailThreshold(picksFinal);
  const droppedMin = tailThreshold(droppedCounts);

  // The dex builder's daily active-users series (see api/_aggregate.ts for
  // rolling24/rolling7 are trailing-hour unique counts; see dailyActive).
  const activity = dexAgg.activity;
  const lastPointLabels = lastPointLabelCounts(merged, now);

  return {
    range,
    rangeStart: start,
    totalUsers,
    funnel: { users: dexIn.length, completed, exported },
    funnelEvents,
    dexFunnel,
    leagueFunnel,
    favoriteFunnel:favoriteUsageFunnel(favoriteNew),
    favorite:favoriteSummary(favoriteIn),
    // Per-cell pick counts of the charts active in the range, from the records already read.
    favoritePicks:favoritePicks(favoriteIn),
    tools,
    crossTool,
    crossToolSince,
    league,
    cohort,
    activity,
    lastPointLabels,
    onboardingLaunchTs: ONBOARDING_LAUNCH_TS,
    exportSettings: exportSettingsAgg,
    retention: dexAgg.retention,
    multiSession,
    timeSurvival,
    timeStats,
    timeCurves,
    depthSurvival,
    depthStats,
    depthCurves,
    lineCurves,
    monCurves,
    // The dex slice, kept at the top level where every existing card reads
    // it. `byTool.dex` is the same object.
    countries: dexAgg.countries,
    languages: dexAgg.languages,
    devices: dexAgg.devices,
    os: dexAgg.os,
    byTool,
    journeys,
    cohorts,
    depthByDevice: depthByDeviceCurves,
    referrerFlow: referrerRows,
    leagueCurves,
    // Full ranked lists; the admin UI previews the top N and expands the rest.
    // Qualification threshold = the median per-Pokemon count for that list, so
    // it self-scales with the data. No cap, so evo lines aren't cut off.
    popularFinal: rankedAtLeast(picksFinal, popularMin),
    mostDropped: rankedAtLeast(droppedCounts, droppedMin),
    popularMin,
    droppedMin,
    // Same, split by the section users actually placed them in (forward-only).
    popularBySection: rankBySectionSelf(picksBySection),
    droppedBySection: rankBySection(droppedBySection, droppedMin),
    picksBySectionAll: rankBySection(picksBySection, 1),
    browsers,
  };
}

/** The stored values one browser has in each store, from one HGET apiece. */
export interface BrowserSource {
  dex: unknown;
  league: unknown;
  favorite: unknown;
  exportSurveySkips: unknown;
}

/**
 * One browser's Dex, League, and Picker records, shaped as the dashboard
 * shapes them, so the admin can open a browser that is not on a loaded page.
 * A store the browser never used is null.
 */
export function buildBrowser(cid: string, source: BrowserSource) {
  const skipMap = parseExportSurveySkipMap(
    source.exportSurveySkips == null ? null : { [cid]: source.exportSurveySkips },
  );
  const dex = source.dex == null ? null : parseRecord(source.dex);
  const league = source.league == null ? null : parseLeagueRecord(source.league);
  const favorite = source.favorite == null ? null : parseFavoriteRecord(source.favorite);
  return {
    cid,
    dex: dex ? stampExportSurveySkips(dex, skipMap) : null,
    league: league ? stampExportSurveySkips(leagueUser(league, dex?.firstTs), skipMap) : null,
    favorite: favorite ? favoriteUser(favorite, false) : null,
  };
}
