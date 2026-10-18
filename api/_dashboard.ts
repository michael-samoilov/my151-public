import {ATTENTION_GAP_MS,attentionSessionCount,type AttentionRecording} from './_attention.js';
import type {RecordingFields} from './_sessionize.js';
import {parseFavoriteRecord, type FavoriteRecord} from './_favoriteRecord.js';
import {favoritePicks, favoriteSummary, favoriteUsageFunnel, favoriteUser} from './_favoriteAggregate.js';
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
import { engagedDex, engagedLeague, engagedPicker, suspectReasons, type SuspectInput, type SuspectReason } from './_visitorQuality.js';
import { TOOL_CATALOG, buildCrossTool, sinceLaunchStarts, type CrossToolSnapshot } from './_crossTool.js';
import { leaguePicks } from './_leaguePicks.js';
import { activeSince, firstSeenSince, funnelDayKeys, rangeStart, type DashboardRange } from './_range.js';
import { excludedTotals } from './_funnelExclusions.js';
function countEvoLines(ids: number[]): number {
  const chains = new Set<number>();
  for (const id of ids) chains.add(EVOLUTION_CHAIN_BY_ID[id] ?? -id);
  return chains.size;
}

function monEndsOf(r: ClientRecord): number[] {
  return r.sessionLog?.map((s) => (s.ids ?? []).length) ?? [r.latestIds?.length ?? 0];
}

function firstTsByCid(records: { cid: string; firstTs: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of records) {
    const cid = bareCid(r.cid);
    out.set(cid, Math.min(out.get(cid) ?? Infinity, r.firstTs));
  }
  return out;
}

const ONBOARDING_LAUNCH_TS = Date.UTC(2026, 6, 8);

function rankedAtLeast(counts: Record<string, number>, min: number): [string, number][] {
  return Object.entries(counts)
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1]);
}

function tailThreshold(counts: Record<string, number>): number {
  const v = Object.values(counts);
  if (v.length === 0) return 2;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.max(2, Math.ceil(mean));
}

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

function weekStart(ts: number): number {
  const day = dayStart(ts);
  const dow = new Date(day).getUTCDay();
  return day - ((dow + 6) % 7) * DAY_MS;
}

type ToolOrder = 'dex-first' | 'league-first' | 'same-day';

function toolOrder(dexFirstTs: number, leagueFirstTs: number): ToolOrder {
  const gap = leagueFirstTs - dexFirstTs;
  if (Math.abs(gap) < DAY_MS) return 'same-day';
  return gap > 0 ? 'dex-first' : 'league-first';
}

interface LeagueUser extends RecordingFields {
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
  hasDex: boolean;
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
    recording: r.recording,
    activeDays: r.activeDays,
    activityCoverageFrom: r.activityCoverageFrom,
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

interface Journeys {
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

export interface DashboardSource {
  clients: Record<string, unknown> | null;
  archived: unknown;
  funnel: Record<string, unknown> | null;
  funnelWindow: Record<string, unknown> | null;
  leagueClients: Record<string, unknown> | null;
  favoriteClients?: Record<string, unknown> | null;
  /** Funnel events of archived browsers, `<day>|<event>` (api/_funnelExclusions.ts). */
  funnelExcluded?: Record<string, unknown> | null;
}

function counts(hash: Record<string, unknown> | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(hash ?? {})) {
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

/** Time measured from retained history, rather than a complete lifetime total. */
export interface BrowserTime {
  sessions: number;
  totalMs: number;
  /** Some tool history is missing, or older foreground intervals were retired. */
  partial?: true;
}

export interface ToolStat {
  /** Progress: Pokémon in the Dex, Gyms with a line, or filled Picker cells. */
  count: number;
  exported?: true;
  /** Every session the tool counted, and their summed time. */
  sessions: number;
  totalMs: number;
  /** Absent when foreground attention has never been recorded. */
  active?: BrowserTime;
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
  /** First seen in the tool this row lists. */
  firstTs: number;
  /** No tool record placed a Pokémon or saw real input: not counted as a user. */
  pageLoadOnly?: true;
  /** Leads that this browser is automated, for the owner to review. */
  suspect?: SuspectReason[];
  dex?: ToolStat;
  league?: ToolStat;
  picker?: ToolStat;
  /** The browser as a whole: sessions merged across tools, time counted once. */
  total: { sessions: number; totalMs: number };
  activeTotal?: BrowserTime;
}

/** Every record of each tool, newest-active first. */
export interface BrowserIndex {
  dex: BrowserRow[];
  league: BrowserRow[];
  picker: BrowserRow[];
}

type Sessions = { sessions?: number; sessionMs?: number[]; attention?: AttentionRecording };
type DexTool = Sessions & { latestIds?: number[]; everIds?: number[]; exported?: boolean; sessionLog?: { ts: number }[] };
type LeagueTool = Sessions & { maxCards: number; maxSeats?: number; exportsCard: number; exportsLeague: number; sessionLog?: { ts: number }[] };
type PickerTool = Sessions & {
  latest: { filled: number };
  maxFilled?: number;
  exportsFull: number;
  exportsSimplified: number;
  sessionLog?: { ts: number; endTs: number }[];
};

function foregroundTime(recordings: readonly (AttentionRecording | undefined)[]): BrowserTime | undefined {
  const measured = recordings.filter((a): a is AttentionRecording => !!a);
  if (!measured.length) return undefined;
  const segments = measured.flatMap(a => a.segments.map(s => ({
    start: Math.max(s.start, a.coverageFrom), end: Math.min(s.end, a.asOf),
  })).filter(s => s.end >= s.start)).sort((a, b) => a.start - b.start || a.end - b.end);
  let end = -Infinity, totalMs = 0;
  for (const s of segments) {
    totalMs += Math.max(0, s.end - Math.max(s.start, end));
    end = Math.max(end, s.end);
  }
  const partial = measured.length < recordings.length || measured.some(a => a.retiredThrough !== undefined);
  return {sessions: attentionSessionCount(segments), totalMs, ...(partial ? {partial: true as const} : {})};
}

function toolStat(count: number, exported: boolean, usage: ToolUsage, attention?: AttentionRecording): ToolStat {
  const active = foregroundTime([attention]);
  return { count, ...(exported ? { exported: true as const } : {}), sessions: usage.sessions, totalMs: usage.totalMs, ...(active ? {active} : {}) };
}

function browserRow(
  rec: SessionRecord,
  tools: { dex?: DexTool; league?: LeagueTool; picker?: PickerTool },
  archived: boolean,
): BrowserRow {
  const { dex, league, picker } = tools;
  const dexUsage = dex && endStampedUsage(dex);
  const leagueUsage = league && endStampedUsage(league);
  const pickerUsage = picker && spanUsage(picker);
  const activeTotal = foregroundTime([dex, league, picker].filter((t): t is DexTool | LeagueTool | PickerTool => !!t).map(t => t.attention));
  const engaged = (!!dex && engagedDex(dex)) || (!!league && engagedLeague(league)) || (!!picker && engagedPicker(picker));
  return {
    cid: rec.cid,
    lastTs: rec.lastTs,
    firstTs: rec.firstTs,
    ...(engaged ? {} : { pageLoadOnly: true as const }),
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
    dex: dex && dexUsage && toolStat(dex.latestIds?.length ?? 0, !!dex.exported, dexUsage, dex.attention),
    league: league && leagueUsage && toolStat(league.maxCards, league.exportsCard + league.exportsLeague > 0, leagueUsage, league.attention),
    picker: picker && pickerUsage && toolStat(picker.latest.filled, picker.exportsFull + picker.exportsSimplified > 0, pickerUsage, picker.attention),
    total: browserTotal([dexUsage, leagueUsage, pickerUsage].filter((u): u is ToolUsage => !!u)),
    ...(activeTotal ? {activeTotal} : {}),
  };
}

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
  const index = {
    dex: dexRows.map((r) => row(r, { dex: r })),
    league: newest(league).map((r) => row(r, { league: r })),
    picker: newest(picker).map((r) => row(r, { picker: r })),
  };
  const byBrowser = new Map<string, SuspectInput>();
  for (const r of [...index.dex, ...index.league, ...index.picker]) {
    const cid = bareCid(r.cid);
    const seen = byBrowser.get(cid);
    if (seen && seen.firstTs <= r.firstTs) continue;
    byBrowser.set(cid, { ...r, cid, activeMs: r.activeTotal?.totalMs ?? r.total.totalMs });
  }
  const suspects = suspectReasons([...byBrowser.values()]);
  for (const list of [index.dex, index.league, index.picker]) {
    for (const r of list) {
      const reasons = suspects.get(bareCid(r.cid));
      if (reasons) r.suspect = reasons;
    }
  }
  return index;
}

export interface RecordedDistribution {
  n: number;
  total: number;
  average: number | null;
  median: number | null;
  values: number[];
}
export interface RecordedWeek {
  week: number; start: number; end: number; partial: boolean; totalMs: number;
}
export interface RecordedUsageSlice {
  weekly?: RecordedWeek[];
  browsers: number;
  missingTime: number;
  missingSessions: number;
  incompleteHistory: number;
  time: RecordedDistribution;
  sessions: RecordedDistribution;
}
export type RecordedUsage = Record<'all' | 'dex' | 'league' | 'favorites', RecordedUsageSlice>;
type RecordedRow = {
  attention?: AttentionRecording;
  cid: string; firstTs: number; lastTs: number; sessions?: number; sessionMs?: number[];
  sessionLog?: {ts: number; endTs?: number; ids?: number[]}[];
  latestIds?: number[]; everIds?: number[]; maxDepth?: number; maxSeats?: number; maxCards?: number; maxFilled?: number;
};
type RecordedSpan = {start: number; end: number; timed: boolean};

export function recordedUsage(rows: Record<'dex' | 'league' | 'favorites', readonly RecordedRow[]>, start: number | null, now: number, source: 'legacy' | 'active' = 'legacy'): RecordedUsage {
  const groups = {all: new Map<string, RecordedSpan[]>(), dex: new Map<string, RecordedSpan[]>(), league: new Map<string, RecordedSpan[]>(), favorites: new Map<string, RecordedSpan[]>()};
  const incomplete = {all: new Set<string>(), dex: new Set<string>(), league: new Set<string>(), favorites: new Set<string>()};
  for (const tool of ['dex', 'league', 'favorites'] as const) {
    const builders = new Set(rows[tool].filter(r => tool === 'dex'
      ? (r.maxDepth ?? 0) > 0 || (r.everIds?.length ?? r.latestIds?.length ?? 0) > 0 || r.sessionLog?.some(s => (s.ids?.length ?? 0) > 0)
      : tool === 'league' ? (r.maxSeats ?? 0) > 0 || (r.maxCards ?? 0) > 0 : (r.maxFilled ?? 0) > 0).map(r => bareCid(r.cid)));
    for (const r of rows[tool]) {
      const cid = bareCid(r.cid);
      if (!builders.has(cid)) continue;
      const log = r.sessionLog ?? [];
      const durations = r.sessionMs ?? [];
      const offset = durations.length - log.length;
      const spans: RecordedSpan[] = [];
      if(source==='active'){
        if(!r.attention){
          if(r.firstTs<=now&&(start===null||r.lastTs>start))for(const key of [tool,'all'] as const)groups[key].set(cid,groups[key].get(cid)??[]);
          continue;
        }
        for(const entry of r.attention.segments){
          if(entry.start>now||entry.end<(start??-Infinity)||entry.end===start)continue;
          spans.push({start:Math.max(entry.start,start??-Infinity),end:Math.min(entry.end,now),timed:true});
        }
        if(!spans.length){
          if(r.firstTs<=now&&(start===null||r.lastTs>start))for(const key of [tool,'all'] as const)groups[key].set(cid,groups[key].get(cid)??[]);
          continue;
        }
      } else log.forEach((entry, index) => {
        if (!Number.isFinite(entry.ts)) return;
        const duration = durations[index + offset];
        const timed = tool === 'favorites' ? Number.isFinite(entry.endTs) && entry.endTs! >= entry.ts
          : Number.isFinite(duration) && duration >= 0;
        const end = tool === 'favorites' && timed ? entry.endTs! : entry.ts;
        const from = tool === 'favorites' || !timed ? entry.ts : end - duration;
        if (from > now || end < (start ?? -Infinity) || (end === start)) return;
        spans.push({start: Math.max(from, start ?? -Infinity), end: Math.min(end, now), timed});
      });
      if (spans.length === 0 && (r.firstTs > now || (start !== null && r.lastTs <= start))) continue;
      for (const key of [tool, 'all'] as const) {
        groups[key].set(cid, [...(groups[key].get(cid) ?? []), ...spans]);
        if(source==='active' ? r.attention?.retiredThrough!==undefined && (start===null||start<=r.attention.retiredThrough) : (r.sessions ?? log.length) > log.length || log.length === 0 || (tool !== 'favorites' && durations.length !== log.length) || spans.some(s => !s.timed)) incomplete[key].add(cid);
      }
    }
  }
  const distribution = (values: number[]): RecordedDistribution => {
    const sorted = [...values].sort((a,b) => a-b);
    const total = sorted.reduce((a,b) => a+b,0);
    return {n: sorted.length, total, average: sorted.length ? total / sorted.length : null,
      median: sorted.length ? quantile(sorted, 0.5) : null, values: sorted};
  };
  const slice = (key: keyof typeof groups): RecordedUsageSlice => {
    const time: number[] = [], sessions: number[] = [];
    const weeklyTotals = new Map<number, number>();
    let earliest = Infinity;
    const weekMs = 7 * 24 * 60 * 60_000;
    for (const raw of groups[key].values()) {
      const unique = [...new Map(raw.map(s => [`${s.start}:${s.end}:${s.timed}`, s])).values()].sort((a,b) => a.start-b.start || a.end-b.end);
      if (unique.length) {
        let visits = 0, end = -Infinity;
        for (const s of unique) {
          if (source==='active' ? s.start-end>=ATTENTION_GAP_MS : s.start > end + 30 * 60_000) visits++;
          end = Math.max(end, s.end);
        }
        sessions.push(visits);
      }
      const timed = unique.filter(s => s.timed);
      if (timed.length) {
        let total = 0, end = -Infinity;
        for (const s of timed) {
          earliest = Math.min(earliest, s.start);
          let from = Math.max(s.start, end);
          total += Math.max(0, s.end - from);
          while (from < s.end) {
            const week = weekStart(from);
            const until = Math.min(s.end, week + weekMs);
            weeklyTotals.set(week, (weeklyTotals.get(week) ?? 0) + until - from);
            from = until;
          }
          end = Math.max(end, s.end);
        }
        time.push(total);
      }
    }
    const weekly: RecordedWeek[] = [];
    const from = start ?? earliest;
    if (time.length && Number.isFinite(from)) {
      for (let week = weekStart(from); week < now; week += weekMs) {
        const begin = Math.max(week, from), end = Math.min(week + weekMs, now);
        weekly.push({week, start: begin, end, partial: begin > week || end < week + weekMs, totalMs: weeklyTotals.get(week) ?? 0});
      }
    }
    return {weekly, browsers: groups[key].size, missingTime: groups[key].size-time.length, missingSessions: groups[key].size-sessions.length,
      incompleteHistory: incomplete[key].size, time: distribution(time), sessions: distribution(sessions)};
  };
  return {all: slice('all'), dex: slice('dex'), league: slice('league'), favorites: slice('favorites')};
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
  const records = withoutArchived(allRecords, archivedSet).filter(engagedDex);

  const without = (all: Record<string, number>, gone: Record<string, number>) =>
    Object.fromEntries(Object.entries(all).map(([ev, n]) => [ev, Math.max(0, n - (gone[ev] ?? 0))]));
  const funnelEvents = without(counts(source.funnel), excludedTotals(source.funnelExcluded, null));
  const windowDays = funnelDayKeys(range, now)?.map((k) => k.slice('funnel:'.length));
  const cohortEvents = source.funnelWindow && windowDays
    ? without(counts(source.funnelWindow), excludedTotals(source.funnelExcluded, new Set(windowDays)))
    : funnelEvents;

  const allLeagueRecords: LeagueRecord[] = Object.values(source.leagueClients ?? {})
    .map(parseLeagueRecord)
    .filter((r): r is LeagueRecord => r !== null);
  const leagueVisits = withoutArchived(allLeagueRecords, archivedSet);
  const leagueRecords = leagueVisits.filter(engagedLeague);

  const allFavoriteRecords = Object.values(source.favoriteClients ?? {}).map(parseFavoriteRecord).filter((r): r is FavoriteRecord => r !== null);
  const favoriteVisits = withoutArchived(allFavoriteRecords, archivedSet);
  const favoriteRecords = favoriteVisits.filter(engagedPicker);

  const start = rangeStart(range, now);
  const within = <T>(list: T[], keep: (r: T) => boolean): T[] => (start === null ? list : list.filter(keep));
  const active = (r: SessionRecord) => activeSince(r, start);
  const dexIn = within(records, active);
  const leagueIn = within(leagueRecords, active);
  const favoriteIn = within(favoriteRecords, active);
  // The picker funnel starts at "opened", so its first step keeps page loads.
  const favoriteNew = within(favoriteVisits, (r) => firstSeenSince(r, start));
  const dexVisits = withoutArchived(allRecords, archivedSet);
  const pageLoads = {
    dex: within(dexVisits, active).filter((r) => !engagedDex(r)).length,
    league: within(leagueVisits, active).filter((r) => !engagedLeague(r)).length,
    favorites: within(favoriteVisits, active).filter((r) => !engagedPicker(r)).length,
  };
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
  const crossToolSince: Record<string, CrossToolSnapshot> = {};
  for (const { id, start: from } of sinceLaunchStarts(TOOL_CATALOG, start)) {
    const w = crossWindow(from);
    crossToolSince[id] = buildCrossTool(w.dex, w.league, undefined, w.favorite);
  }

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

  const lineVals = { total: [] as number[], first: [] as number[], longest: [] as number[], all: [] as number[] };
  const monVals = { total: [] as number[], first: [] as number[], longest: [] as number[], all: [] as number[] };
  const picksFinal: Record<string, number> = {};
  const droppedCounts: Record<string, number> = {};

  const picksBySection: Record<string, Record<string, number>> = {};
  const droppedBySection: Record<string, Record<string, number>> = {};
  const bump = (m: Record<string, Record<string, number>>, sid: string, id: number) => {
    (m[sid] ??= {})[id] = (m[sid][id] ?? 0) + 1;
  };

  let completed = 0;
  let exported = 0;
  let multiSession = 0;

  const cohort: [number, number, number, 0 | 1, 0 | 1][] = [];
  const monPeakEntries: { device?: string; value: number }[] = [];
  const exportSettingsAgg = {
    tracked: 0,
    outlines: 0,
    groupSpecial: 0,
    showStats: 0,
    sorts: {} as Record<string, number>,
  };

  for (const r of dexIn) {
    const sessSecs = sessionSeconds(r);
    let li = 0;
    for (let i = 1; i < sessSecs.length; i++) if (sessSecs[i] > sessSecs[li]) li = i;

    const logCounts = r.sessionLog?.map((s) => countEvoLines(s.ids ?? []));
    const lineEnds =
      r.sessionDepth && r.sessionDepth.length > 0 ? r.sessionDepth : (logCounts ?? [r.maxDepth]);
    const monEnds = monEndsOf(r);

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

    const peakMon = Math.max(0, ...monEnds);
    const peakLines = Math.max(0, ...lineEnds);
    cohort.push([r.firstTs, peakMon, peakLines, r.completed ? 1 : 0, r.exported ? 1 : 0]);
    monPeakEntries.push({ device: r.device, value: peakMon });

    for (const id of r.latestIds ?? []) picksFinal[id] = (picksFinal[id] ?? 0) + 1;
    if (r.completed) completed += 1;

    const kept = new Set(r.latestIds ?? []);
    for (const id of r.everIds ?? []) {
      if (!kept.has(id)) droppedCounts[id] = (droppedCounts[id] ?? 0) + 1;
    }

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

  const timeCurves = dexAgg.timeCurves;
  const timeSurvival = timeCurves.longest.survival;
  const timeStats = timeCurves.longest.stats;

  const curvesFor = (v: typeof lineVals) => ({
    total: buildDepthCurve(v.total),
    first: buildDepthCurve(v.first),
    longest: buildDepthCurve(v.longest),
    all: buildDepthCurve(v.all),
  });
  const lineCurves = curvesFor(lineVals);
  const monCurves = curvesFor(monVals);
  const depthCurves = lineCurves;

  const depthSurvival = lineCurves.total.survival;
  const depthStats = lineCurves.total.stats;

  const cohorts: Record<'built' | 'incomplete' | 'completed', Cohort> = {
    built: tallyCohort(dexIn),
    completed: tallyCohort(dexIn.filter((r) => r.completed === true)),
    incomplete: tallyCohort(dexIn.filter((r) => r.completed !== true)),
  };

  const depthByDeviceCurves = depthByDevice(monPeakEntries);

  const referrerRows = referrerFlow(dexNew, leagueNew, favoriteNew);

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
  const browsers = browserIndex(allRecords, allLeagueRecords, allFavoriteRecords, archivedSet);

  const popularMin = tailThreshold(picksFinal);
  const droppedMin = tailThreshold(droppedCounts);

  const activity = dexAgg.activity;
  const lastPointLabels = lastPointLabelCounts(merged, now);

  return {
    range,
    rangeStart: start,
    recordedUsage: recordedUsage({dex: records, league: leagueRecords, favorites: favoriteRecords}, start, now),
    attentionUsage: recordedUsage({dex: records, league: leagueRecords, favorites: favoriteRecords}, start, now, 'active'),
    totalUsers,
    funnel: { users: dexIn.length, completed, exported },
    funnelEvents,
    dexFunnel,
    leagueFunnel,
    favoriteFunnel:favoriteUsageFunnel(favoriteNew),
    pageLoads,
    favorite:favoriteSummary(favoriteIn),
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
    popularFinal: rankedAtLeast(picksFinal, popularMin),
    mostDropped: rankedAtLeast(droppedCounts, droppedMin),
    popularMin,
    droppedMin,
    popularBySection: rankBySectionSelf(picksBySection),
    droppedBySection: rankBySection(droppedBySection, droppedMin),
    picksBySectionAll: rankBySection(picksBySection, 1),
    browsers,
  };
}

interface BrowserSource {
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
