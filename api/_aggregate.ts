/**
 * The dashboard aggregations that do not care which tool a record comes from.
 *
 * `api/submissions.ts` computed all of these inline against `ClientRecord`,
 * so the gym leader maker's records — the same shape where it matters — had
 * no way to reach them. Here they are typed against `SessionRecord`, the
 * subset both record types satisfy, and the endpoint calls them once per
 * tool.
 *
 * Nothing here touches Redis, so `src/lib/aggregate.test.ts` drives it
 * directly. The leading underscore keeps Vercel from serving this file as a
 * route.
 */

import { CARD_COUNT } from './_leagueRecord.js';

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
const ROLLING_24H_MS = 24 * HOUR_MS;
const ROLLING_7D_MS = 7 * DAY_MS;
const HOURLY_WINDOW_DAYS = 7;

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * What every aggregation below needs from a record: when the browser was
 * active, where it was, and what it ran on. `ClientRecord` (the dex builder)
 * and `LeagueRecord` (the gym leader maker) both satisfy it, each with its
 * own extra fields on top.
 */
export interface SessionRecord {
  cid: string;
  firstTs: number;
  lastTs: number;
  sessions?: number;
  sessionMs?: number[];
  /** One entry per session. Only `ts` is read here; each tool adds its own
   *  build state to the same entry. */
  sessionLog?: { ts: number }[];
  country?: string;
  region?: string;
  tz?: string;
  lang?: string;
  locale?: string;
  /** Locale pinned in the language picker. Absent when the browser still follows negotiation. */
  switched?: string;
  device?: string;
  os?: string;
  browser?: string;
  localHour?: number;
  localDow?: number;
}

/** The categorical fields `tallies` can count. */
export type TallyField = 'country' | 'region' | 'lang' | 'locale' | 'device' | 'os' | 'browser';

export interface SurvivalCurve {
  survival: { t: number; s: number }[];
  stats: { p50: number; p75: number; p90: number };
  n: number;
}

/** UTC midnight (ms) of the day a timestamp falls in. */
export function dayStart(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** UTC hour start (ms) of the hour a timestamp falls in. */
export function hourStart(ts: number): number {
  return Math.floor(ts / HOUR_MS) * HOUR_MS;
}

/** Value at quantile q (0..1) of an ascending-sorted array. */
export function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const i = Math.min(sortedAsc.length - 1, Math.floor(q * sortedAsc.length));
  return sortedAsc[i];
}

/** Fraction of values >= t (the survival function), via binary search. */
export function survivalAt(sortedAsc: number[], t: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return (n - lo) / n;
}

/**
 * Time survival curve + percentile stats from a set of durations in seconds.
 * Sampled fine-grained where it matters — every 30s for the first 10 minutes,
 * then every 60s out to the 95th percentile, so the long tail cannot flatten
 * the interesting region.
 */
export function buildTimeCurve(secsRaw: number[]): SurvivalCurve {
  const secs = secsRaw.slice().sort((a, b) => a - b);
  const tMax = Math.max(60, quantile(secs, 0.95));
  const ticks: number[] = [];
  for (let t = 0; t <= Math.min(tMax, 600); t += 30) ticks.push(t);
  for (let t = 660; t <= tMax; t += 60) ticks.push(t);
  if (ticks[ticks.length - 1] !== tMax) ticks.push(tMax);
  return {
    survival: ticks.map((t) => ({ t, s: survivalAt(secs, t) })),
    stats: { p50: quantile(secs, 0.5), p75: quantile(secs, 0.75), p90: quantile(secs, 0.9) },
    n: secs.length,
  };
}

/** Count survival curve: one integer tick from 0 to the largest value seen. */
export function buildDepthCurve(vals: number[]): SurvivalCurve {
  const v = vals.slice().sort((a, b) => a - b);
  const dMax = Math.max(1, v[v.length - 1] ?? 1);
  const survival: { t: number; s: number }[] = [];
  for (let d = 0; d <= dMax; d++) survival.push({ t: d, s: survivalAt(v, d) });
  return {
    survival,
    stats: { p50: quantile(v, 0.5), p75: quantile(v, 0.75), p90: quantile(v, 0.9) },
    n: v.length,
  };
}

/**
 * Depth survival split by device.
 *
 * `all` uses every value; `mobile` and `desktop` use only the values from an
 * entry whose device is that type. Any other device (Tablet, absent) still
 * contributes to `all`, just not to either split. The caller supplies one
 * `value` per record — whatever depth metric it wants split — so this stays
 * agnostic to what a "depth" is.
 */
export function depthByDevice(
  entries: { device?: string; value: number }[],
): Record<'all' | 'mobile' | 'desktop', SurvivalCurve> {
  const all: number[] = [];
  const mobile: number[] = [];
  const desktop: number[] = [];
  for (const e of entries) {
    all.push(e.value);
    if (e.device === 'Mobile') mobile.push(e.value);
    else if (e.device === 'Desktop') desktop.push(e.value);
  }
  return { all: buildDepthCurve(all), mobile: buildDepthCurve(mobile), desktop: buildDepthCurve(desktop) };
}

/**
 * Each session's duration in seconds. Prefers the per-session list; falls back
 * to the first-to-last span as one session, which is all a legacy record can
 * offer.
 */
export function sessionSeconds(r: SessionRecord): number[] {
  if (r.sessionMs && r.sessionMs.length > 0) return r.sessionMs.map((ms) => Math.round(ms / 1000));
  return [Math.round(Math.max(0, r.lastTs - r.firstTs) / 1000)];
}

/** The timestamps a record was active at: one per session, or first/last for a
 *  legacy record with no session log. */
export function activeTimestamps(r: SessionRecord): number[] {
  if (r.sessionLog && r.sessionLog.length > 0) return r.sessionLog.map((s) => s.ts);
  return [r.firstTs, r.lastTs];
}

/** Rolling unique `cid` counts at `now` for gutter / last chart point. */
export function lastPointLabelCounts(
  records: SessionRecord[],
  now: number,
): { label24h: number | null; label168h: number | null } {
  const events: { ts: number; cid: string }[] = [];
  for (const r of records) {
    for (const ts of activeTimestamps(r)) events.push({ ts, cid: r.cid });
  }
  if (events.length === 0) return { label24h: null, label168h: null };
  const firstTs = Math.min(...events.map((e) => e.ts));
  return {
    label24h: rollingUniqueAt(events, now, ROLLING_24H_MS, firstTs),
    label168h: rollingUniqueAt(events, now, ROLLING_7D_MS, firstTs),
  };
}

function rollingUniqueAt(
  events: { ts: number; cid: string }[],
  asOf: number,
  windowMs: number,
  firstTs: number,
): number | null {
  if (asOf - firstTs < windowMs) return null;
  const start = asOf - windowMs;
  const roll = new Set<string>();
  for (const e of events) {
    if (e.ts > start && e.ts <= asOf) roll.add(e.cid);
  }
  return roll.size;
}

export type DailyActivityPoint = {
  day: number;
  dau: number;
  rolling7: number;
  /** Rolling 24h unique `cid` at `now` — set only on today's row when `now` is given. */
  label24h?: number | null;
  /** Rolling 168h unique `cid` at `now` — set only on today's row when `now` is given. */
  label168h?: number | null;
};

/**
 * Dense daily active-users series with a trailing-7-day calendar rolling count.
 *
 * `dau` is distinct browsers that UTC day; `rolling7` is distinct browsers over
 * that day and the prior six (calendar WAU, not a DAU sum). When `now` is given,
 * today's row also carries `label24h` / `label168h`: unique browsers in
 * (now − 24h, now] and (now − 168h, now] for the chart's last point and gutter.
 */
export function dailyActive(records: SessionRecord[], now?: number): DailyActivityPoint[] {
  const sets: Record<number, Set<string>> = {};
  const events: { ts: number; cid: string }[] = [];
  for (const r of records) {
    for (const ts of activeTimestamps(r)) {
      events.push({ ts, cid: r.cid });
      const day = dayStart(ts);
      (sets[day] ??= new Set()).add(r.cid);
    }
  }
  const dayKeys = Object.keys(sets).map(Number);
  if (dayKeys.length === 0) return [];
  const firstTs = events.length ? Math.min(...events.map((e) => e.ts)) : 0;
  const firstDay = Math.min(...dayKeys);
  const lastActivity = Math.max(...dayKeys);
  const todayStart = now != null ? dayStart(now) : null;
  const lastDay = todayStart != null ? Math.max(lastActivity, todayStart) : lastActivity;
  const out: DailyActivityPoint[] = [];
  for (let day = firstDay; day <= lastDay; day += DAY_MS) {
    const roll = new Set<string>();
    for (let d = day - 6 * DAY_MS; d <= day; d += DAY_MS) {
      const s = sets[d];
      if (s) for (const cid of s) roll.add(cid);
    }
    const row: DailyActivityPoint = { day, dau: sets[day]?.size ?? 0, rolling7: roll.size };
    if (todayStart !== null && now != null && day === todayStart) {
      row.label24h = rollingUniqueAt(events, now, ROLLING_24H_MS, firstTs);
      row.label168h = rollingUniqueAt(events, now, ROLLING_7D_MS, firstTs);
    }
    out.push(row);
  }
  return out;
}

export type HourlyActivityPoint = {
  hour: number;
  unique: number;
};

/**
 * Dense hourly unique-browser series for the last seven UTC days through the
 * current hour. `unique` is distinct `cid`s whose activity fell in that hour.
 */
export function hourlyActive(records: SessionRecord[], now: number): HourlyActivityPoint[] {
  if (records.length === 0) return [];
  const sets: Record<number, Set<string>> = {};
  for (const r of records) {
    for (const ts of activeTimestamps(r)) {
      const hour = hourStart(ts);
      (sets[hour] ??= new Set()).add(r.cid);
    }
  }
  const lastHour = hourStart(now);
  const start = dayStart(now) - (HOURLY_WINDOW_DAYS - 1) * DAY_MS;
  const out: HourlyActivityPoint[] = [];
  for (let h = start; h <= lastHour; h += HOUR_MS) {
    out.push({ hour: h, unique: sets[h]?.size ?? 0 });
  }
  return out;
}

/** Returning (active across two calendar days or more), active in the last 7
 *  days, and the remainder as new. */
export function retention(
  records: SessionRecord[],
  now: number,
): { returning: number; activeLast7: number; newUsers: number } {
  let returning = 0;
  let activeLast7 = 0;
  for (const r of records) {
    if (r.lastTs - r.firstTs >= DAY_MS) returning += 1;
    if (now - r.lastTs <= 7 * DAY_MS) activeLast7 += 1;
  }
  return { returning, activeLast7, newUsers: records.length - returning };
}

/**
 * Session-length drop-off on three bases: each browser's longest session, its
 * first session, and every session pooled.
 */
export function sessionCurves(records: SessionRecord[]): Record<'longest' | 'first' | 'all', SurvivalCurve> {
  const longest: number[] = [];
  const first: number[] = [];
  const all: number[] = [];
  for (const r of records) {
    const secs = sessionSeconds(r);
    longest.push(Math.max(...secs));
    first.push(secs[0]);
    for (const s of secs) all.push(s);
  }
  return { longest: buildTimeCurve(longest), first: buildTimeCurve(first), all: buildTimeCurve(all) };
}

/** Browsers per distinct value of one categorical field. Absent values are
 *  skipped rather than bucketed as "unknown": the caller knows the denominator. */
export function tallies(records: SessionRecord[], field: TallyField): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of records) {
    const v = r[field];
    if (v) out[v] = (out[v] ?? 0) + 1;
  }
  return out;
}

/**
 * Local day-of-week (0=Sun) and hour (0-23) for a record, from its timezone and
 * last activity. Prefers the stored fields, and otherwise derives them from
 * `lastTs` + `tz` — which back-populates every record written before those
 * fields existed.
 */
export function localSlot(r: SessionRecord): { dow: number; hour: number } | null {
  if (typeof r.localDow === 'number' && typeof r.localHour === 'number') {
    return { dow: r.localDow % 7, hour: r.localHour % 24 };
  }
  if (!r.lastTs) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: r.tz || 'UTC',
      weekday: 'short',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(r.lastTs);
    const wd = parts.find((p) => p.type === 'weekday')?.value ?? '';
    const hrStr = parts.find((p) => p.type === 'hour')?.value ?? '';
    const dow = DOW_NAMES.indexOf(wd);
    const hour = parseInt(hrStr, 10) % 24;
    if (dow < 0 || !Number.isFinite(hour)) return null;
    return { dow, hour };
  } catch {
    return null;
  }
}

/** Hour-of-day totals and the 7 x 24 day-by-hour matrix of local activity. */
export function heatmap(records: SessionRecord[]): { hours: number[]; matrix: number[][] } {
  const hours = new Array<number>(24).fill(0);
  const matrix: number[][] = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const r of records) {
    const slot = localSlot(r);
    if (!slot) continue;
    hours[slot.hour] += 1;
    matrix[slot.dow][slot.hour] += 1;
  }
  return { hours, matrix };
}

/** One bucket of browsers that share a country, browser language, served locale, and pin. */
export interface WhoBucket {
  country: string;
  lang: string;
  locale: string;
  switched: string;
  n: number;
}

/** Everything the dashboard shows for one tool's records. */
export interface Aggregates {
  users: number;
  activity: DailyActivityPoint[];
  hourly: HourlyActivityPoint[];
  retention: { returning: number; activeLast7: number; newUsers: number };
  timeCurves: Record<'longest' | 'first' | 'all', SurvivalCurve>;
  countries: Record<string, number>;
  languages: Record<string, number>;
  locales: Record<string, number>;
  devices: Record<string, number>;
  os: Record<string, number>;
  browsers: Record<string, number>;
  joints: PlatformJoint[];
  /** Country × browser language × served locale × picker pin. */
  whoBuckets: WhoBucket[];
  /** Distinct countries with a session in the 168 hours ending at the latest session. */
  countries7d: number;
  hours: number[];
  heatmap: number[][];
}

/** Every aggregation above, over one record list. */
export function aggregate(records: SessionRecord[], now: number): Aggregates {
  const hm = heatmap(records);
  return {
    users: records.length,
    activity: dailyActive(records, now),
    hourly: hourlyActive(records, now),
    retention: retention(records, now),
    timeCurves: sessionCurves(records),
    countries: tallies(records, 'country'),
    languages: tallies(records, 'lang'),
    locales: tallies(records, 'locale'),
    devices: tallies(records, 'device'),
    os: tallies(records, 'os'),
    browsers: tallies(records, 'browser'),
    joints: tallyJoints(records),
    whoBuckets: tallyWhoBuckets(records),
    countries7d: distinctCountries7d(records),
    hours: hm.hours,
    heatmap: hm.matrix,
  };
}

const WINDOW_7D_MS = 7 * DAY_MS;

/** Group records so Who can split language and pins by country. */
export function tallyWhoBuckets(records: SessionRecord[]): WhoBucket[] {
  const map = new Map<string, WhoBucket>();
  for (const r of records) {
    const country = (r.country ?? '').toUpperCase();
    const lang = r.lang ?? '';
    const locale = r.locale ?? '';
    const switched = r.switched ?? '';
    const k = `${country}\t${lang}\t${locale}\t${switched}`;
    const cur = map.get(k);
    if (cur) cur.n += 1;
    else map.set(k, { country, lang, locale, switched, n: 1 });
  }
  return [...map.values()].sort(
    (a, b) => b.n - a.n || a.country.localeCompare(b.country) || a.lang.localeCompare(b.lang),
  );
}

/**
 * Distinct countries among browsers with a session in the 168 hours that end
 * at the latest session in this set. The window follows the data, not `now`.
 */
export function distinctCountries7d(records: SessionRecord[]): number {
  let end = 0;
  for (const r of records) {
    for (const ts of activeTimestamps(r)) if (ts > end) end = ts;
  }
  if (end <= 0) return 0;
  const start = end - WINDOW_7D_MS;
  const seen = new Set<string>();
  for (const r of records) {
    if (!r.country) continue;
    const hit = activeTimestamps(r).some((ts) => ts > start && ts <= end);
    if (hit) seen.add(r.country.toUpperCase());
  }
  return seen.size;
}

export interface PlatformJoint {
  device: string;
  os: string;
  browser: string;
  n: number;
}

/** One cohort's size and platform/country mix — the built/incomplete/
 *  completed toggle on the dashboard tallies the same fields three times,
 *  once per slice. */
export interface Cohort {
  users: number;
  devices: Record<string, number>;
  os: Record<string, number>;
  countries: Record<string, number>;
  browsers: Record<string, number>;
  joints: PlatformJoint[];
}

export function tallyJoints(
  records: Array<{ device?: string; os?: string; browser?: string }>,
): PlatformJoint[] {
  const map = new Map<string, PlatformJoint>();
  for (const r of records) {
    const device = r.device || 'Unknown';
    const os = r.os || 'Unknown';
    const browser = r.browser || 'Unknown';
    const k = `${device}\t${os}\t${browser}`;
    const cur = map.get(k);
    if (cur) cur.n += 1;
    else map.set(k, { device, os, browser, n: 1 });
  }
  return [...map.values()];
}

/** Tally one slice of records into a `Cohort`. The caller decides what the
 *  slice is (all records, or filtered by some record-type-specific field like
 *  `completed`); this only knows how to count what is already in the slice. */
export function tallyCohort(records: SessionRecord[]): Cohort {
  return {
    users: records.length,
    devices: tallies(records, 'device'),
    os: tallies(records, 'os'),
    countries: tallies(records, 'country'),
    browsers: tallies(records, 'browser'),
    joints: tallyJoints(records),
  };
}

/** What `referrerFlow` needs from a record: its browser id and, when known,
 *  the host that first sent it here. Both `ClientRecord` and `LeagueRecord`
 *  satisfy it. */
export interface Referrable {
  cid: string;
  firstReferrer?: string;
}

/** One acquisition host's reach across both tools. */
export interface ReferrerFlowEntry {
  host: string;
  total: number;
  dex: number;
  league: number;
}

/** Label for records with no `firstReferrer`: legacy rows, direct visits, and
 *  internal navigation. Kept as a host string so the Sankey treats it like any
 *  other source node. */
export const UNKNOWN_REFERRER_HOST = 'referrer not known';

/** Named known hosts shown on the referrer Sankey. The unknown bucket is
 *  always appended when it has anyone, so it never competes for a slot. */
const TOP_REFERRER_HOSTS = 8;

/**
 * Referrer hosts ranked by distinct browsers reached, across both stores.
 *
 * Records with no `firstReferrer` (the field is forward-only; see
 * api/_leagueRecord.ts) count as {@link UNKNOWN_REFERRER_HOST} rather than
 * disappearing from the Sankey. A dex record's cid is split the same way
 * `mergeByCid` does, so a country-split record still counts as one browser.
 * The top 8 named hosts by total reach are kept; the unknown bucket is always
 * included when it has anyone.
 */
export function referrerFlow(dexRecords: Referrable[], leagueRecords: Referrable[]): ReferrerFlowEntry[] {
  const byHost = (records: Referrable[]) => {
    const out = new Map<string, Set<string>>();
    for (const r of records) {
      const host = r.firstReferrer || UNKNOWN_REFERRER_HOST;
      const cid = r.cid.split('::')[0];
      const set = out.get(host) ?? new Set<string>();
      set.add(cid);
      out.set(host, set);
    }
    return out;
  };
  const dexByHost = byHost(dexRecords);
  const leagueByHost = byHost(leagueRecords);
  const hosts = new Set([...dexByHost.keys(), ...leagueByHost.keys()]);
  const rows = [...hosts].map((host) => {
    const dexCids = dexByHost.get(host) ?? new Set<string>();
    const leagueCids = leagueByHost.get(host) ?? new Set<string>();
    return { host, total: new Set([...dexCids, ...leagueCids]).size, dex: dexCids.size, league: leagueCids.size };
  });
  const unknown = rows.find((r) => r.host === UNKNOWN_REFERRER_HOST);
  const known = rows
    .filter((r) => r.host !== UNKNOWN_REFERRER_HOST)
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP_REFERRER_HOSTS);
  if (unknown && unknown.total > 0) known.push(unknown);
  return known;
}

/** Incomplete dex size bucket. `exported` is builders in this bucket who
 *  exported; they still count in `count`, and the chart draws a branch from
 *  the bucket to Exported. Non-exporters stay in the bucket. */
export interface DexSizeBucket {
  label: string;
  count: number;
  exported: number;
}

/** League gym-completion bucket. Export counts are of people in this bucket
 *  who exported a league (or both) vs a card only. Incomplete buckets keep
 *  non-exporters in the bucket. Full league peels them to Kept private. */
export interface LeagueGymBucket {
  label: string;
  count: number;
  exportedLeague: number;
  exportedCard: number;
}

/** Dex builder usage funnel: intro → built → in-line size buckets + completed. */
export interface DexUsageFunnel {
  opened: number;
  built: number;
  bounced: number;
  buckets: DexSizeBucket[];
  completed: number;
  exported: number;
  keptPrivate: number;
}

/** Gym leader maker usage funnel: open → placed a Pokémon → one gym full →
 *  in-line gym-completion buckets → export. Full league also peels
 *  non-exporters to Kept private. */
export interface LeagueUsageFunnel {
  opened: number;
  placed: number;
  bounced: number;
  oneGymFull: number;
  cardNotFinished: number;
  gymBuckets: LeagueGymBucket[];
  fullLeague: number;
  exportedLeague: number;
  exportedCard: number;
  keptPrivate: number;
}

export interface SizeTier {
  label: string;
  min: number;
  max: number;
}

/** Incomplete dex sizes, in Pokémon. The last bucket also takes a 151 that
 *  never flipped `completed`. */
export const DEX_SIZE_BUCKETS: readonly SizeTier[] = [
  { label: '1–30', min: 0, max: 30 },
  { label: '31–60', min: 31, max: 60 },
  { label: '61–90', min: 61, max: 90 },
  { label: '91–120', min: 91, max: 120 },
  { label: '121–150', min: 121, max: Number.POSITIVE_INFINITY },
];

/** Full-gym counts, in-line from "one gym full". 13 full gyms sit in 9–12. */
export const LEAGUE_GYM_BUCKETS: readonly SizeTier[] = [
  { label: '1–4 gyms', min: 1, max: 4 },
  { label: '5–8 gyms', min: 5, max: 8 },
  { label: '9–12 gyms', min: 9, max: CARD_COUNT - 1 },
  { label: 'Full league', min: CARD_COUNT, max: CARD_COUNT },
];

export interface DexFunnelRow {
  cid: string;
  peakMon: number;
  completed: boolean;
  exported: boolean;
}

export interface LeagueFunnelRow {
  maxCards: number;
  maxSeats: number;
  fullGyms: number;
  exportsCard: number;
  exportsLeague: number;
}

function mergeDexFunnelRows(rows: DexFunnelRow[]): Omit<DexFunnelRow, 'cid'>[] {
  const byCid = new Map<string, Omit<DexFunnelRow, 'cid'>>();
  for (const r of rows) {
    const cid = r.cid.split('::')[0];
    const prev = byCid.get(cid);
    if (!prev) {
      byCid.set(cid, { peakMon: r.peakMon, completed: r.completed, exported: r.exported });
      continue;
    }
    byCid.set(cid, {
      peakMon: Math.max(prev.peakMon, r.peakMon),
      completed: prev.completed || r.completed,
      exported: prev.exported || r.exported,
    });
  }
  return [...byCid.values()];
}

function inTier(value: number, tier: SizeTier): boolean {
  return value >= tier.min && value <= tier.max;
}

function placedAPokemon(r: LeagueFunnelRow): boolean {
  return r.maxSeats > 0 || r.maxCards > 0 || r.fullGyms > 0;
}

function leagueExportSplit(rows: LeagueFunnelRow[]): { exportedLeague: number; exportedCard: number } {
  return {
    exportedLeague: rows.filter((r) => r.exportsLeague > 0).length,
    exportedCard: rows.filter((r) => r.exportsLeague === 0 && r.exportsCard > 0).length,
  };
}

/**
 * Dex usage funnel from per-record peaks. `opened` is the top of funnel
 * (intro shown, or built when the event count is missing or smaller).
 *
 * Incomplete sizes fan out of Built in one column, next to Completed.
 * An incomplete builder who exported still sits in their size bucket, with
 * a branch from that bucket to Exported. Kept private stays a Completed
 * outcome only.
 */
export function dexUsageFunnel(rows: DexFunnelRow[], openedHint: number): DexUsageFunnel {
  const merged = mergeDexFunnelRows(rows);
  const built = merged.length;
  const opened = Math.max(openedHint, built);
  const bounced = Math.max(0, opened - built);
  const completedRows = merged.filter((r) => r.completed);
  const completed = completedRows.length;
  const exported = completedRows.filter((r) => r.exported).length;
  const incomplete = merged.filter((r) => !r.completed);
  const buckets = DEX_SIZE_BUCKETS.map((t) => {
    const inBucket = incomplete.filter((r) => inTier(r.peakMon, t));
    return {
      label: t.label,
      count: inBucket.length,
      exported: inBucket.filter((r) => r.exported).length,
    };
  }).filter((b) => b.count > 0);
  return {
    opened,
    built,
    bounced,
    buckets,
    completed,
    exported,
    keptPrivate: Math.max(0, completed - exported),
  };
}

/**
 * League usage funnel from per-record gym peaks.
 *
 * Stages: opened (league-open event, floored at people who placed a
 * Pokémon), placed a Pokémon vs bounced, one gym full vs card not finished,
 * then in-line gym-count buckets. Exports (league, card-only, or both)
 * leave each gym bucket toward the export nodes. Both-export counts as a
 * league export, same as before. Full-league people who exported neither
 * peel to Kept private. Incomplete gym buckets do not.
 */
export function leagueUsageFunnel(rows: LeagueFunnelRow[], openedHint: number): LeagueUsageFunnel {
  const placedRows = rows.filter(placedAPokemon);
  const placed = placedRows.length;
  const opened = Math.max(openedHint, placed);
  const bounced = Math.max(0, opened - placed);
  const gymRows = placedRows.filter((r) => r.fullGyms >= 1);
  const oneGymFull = gymRows.length;
  const cardNotFinished = Math.max(0, placed - oneGymFull);
  const gymBuckets = LEAGUE_GYM_BUCKETS.map((t) => {
    const inBucket = gymRows.filter((r) => inTier(r.fullGyms, t));
    return { label: t.label, count: inBucket.length, ...leagueExportSplit(inBucket) };
  }).filter((b) => b.count > 0);
  const fullLeagueRows = gymRows.filter((r) => r.fullGyms >= CARD_COUNT);
  const fullLeague = fullLeagueRows.length;
  const keptPrivate = fullLeagueRows.filter((r) => r.exportsLeague === 0 && r.exportsCard === 0).length;
  const { exportedLeague, exportedCard } = leagueExportSplit(gymRows);
  return {
    opened,
    placed,
    bounced,
    oneGymFull,
    cardNotFinished,
    gymBuckets,
    fullLeague,
    exportedLeague,
    exportedCard,
    keptPrivate,
  };
}

/** Count a funnel event under either hyphen or underscore keys. */
export function funnelEventCount(events: Record<string, number> | undefined, name: string): number {
  if (!events) return 0;
  const underscored = name.replace(/-/g, '_');
  const n = events[name] ?? events[underscored];
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/**
 * One record per browser across both tools: the same person's sessions from
 * the dex builder and the gym leader maker in one record, so the "All" slice
 * counts them once and their day is one day.
 *
 * Identity is the bare cid. The dex builder splits a suspected shared browser
 * into `cid::COUNTRY` records (see docs/analytics-accuracy.md), and those
 * splits merge back together here rather than pretending to be separate
 * people the league store never heard of.
 */
export function mergeByCid(lists: SessionRecord[][]): SessionRecord[] {
  const byCid = new Map<string, SessionRecord>();
  for (const list of lists) {
    for (const r of list) {
      const cid = r.cid.split('::')[0];
      const prev = byCid.get(cid);
      if (!prev) {
        byCid.set(cid, { ...r, cid });
        continue;
      }
      // The later record wins for the "where are they now" fields; the session
      // history is the union of both, in time order.
      const newer = r.lastTs >= prev.lastTs ? r : prev;
      const timed = [...timedSessions(prev), ...timedSessions(r)].sort((a, b) => a.ts - b.ts);
      byCid.set(cid, {
        ...newer,
        cid,
        firstTs: Math.min(prev.firstTs, r.firstTs),
        lastTs: Math.max(prev.lastTs, r.lastTs),
        sessions: (prev.sessions ?? 0) + (r.sessions ?? 0) || undefined,
        sessionMs: timed.map((t) => t.ms),
        sessionLog: timed.map((t) => ({ ts: t.ts })),
      });
    }
  }
  return [...byCid.values()];
}

/**
 * A record's sessions as `{ts, ms}` pairs, so two tools' histories can be
 * interleaved by time rather than concatenated.
 *
 * `sessionMs` and `sessionLog` are written in lockstep and both keep the most
 * recent entries, so they align from the END. They can still differ in length
 * by one, on a legacy record whose first-to-last span was back-filled into
 * `sessionMs` before it had a log; end-alignment drops that unpairable entry
 * rather than misdating every session after it.
 */
function timedSessions(r: SessionRecord): { ts: number; ms: number }[] {
  const log = r.sessionLog ?? [];
  const ms = r.sessionMs ?? [];
  const n = Math.min(log.length, ms.length);
  if (n === 0) {
    // No pairing to make. One session spanning the record is what a legacy
    // record supports, and it is what sessionSeconds would have inferred.
    return [{ ts: r.firstTs, ms: Math.max(0, r.lastTs - r.firstTs) }];
  }
  const out: { ts: number; ms: number }[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ ts: log[log.length - n + i].ts, ms: ms[ms.length - n + i] });
  }
  return out;
}
