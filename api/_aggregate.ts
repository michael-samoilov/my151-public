import { FAVORITE_SESSION_GAP_MS } from './_favoriteRecord.js';
import { CARD_COUNT, LEAGUE_SESSION_GAP_MS } from './_leagueRecord.js';
import { alignSessionMs } from './_sessionize.js';

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
const ROLLING_24H_MS = 24 * HOUR_MS;
const ROLLING_7D_MS = 7 * DAY_MS;
const ROLLING_30D_MS = 30 * DAY_MS;
const HOURLY_WINDOW_DAYS = 7;

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface ActivitySourceCoverage {
  firstTs: number;
  lastTs: number;
  from?: number;
  hasDays: boolean;
}

export interface SessionRecord {
  cid: string;
  firstTs: number;
  lastTs: number;
  activeDays?: number[];
  activityCoverageFrom?: number;
  activityCoverageSources?: ActivitySourceCoverage[];
  sessions?: number;
  sessionMs?: number[];
  sessionLog?: { ts: number }[];
  /** The UTC days this record counts as an active user (api/_visitorQuality.ts).
   *  When absent, every day with activity counts. */
  engagedDays?: number[];
  country?: string;
  region?: string;
  tz?: string;
  lang?: string;
  locale?: string;
  switched?: string;
  device?: string;
  os?: string;
  browser?: string;
}

type TallyField = 'country' | 'region' | 'lang' | 'locale' | 'device' | 'os' | 'browser';

export interface SurvivalCurve {
  survival: { t: number; s: number }[];
  stats: { p50: number; p75: number; p90: number };
  n: number;
}

export function dayStart(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function hourStart(ts: number): number {
  return Math.floor(ts / HOUR_MS) * HOUR_MS;
}

export function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const i = Math.min(sortedAsc.length - 1, Math.floor(q * sortedAsc.length));
  return sortedAsc[i];
}

function survivalAt(sortedAsc: number[], t: number): number {
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

function buildTimeCurve(secsRaw: number[]): SurvivalCurve {
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

export function sessionSeconds(r: SessionRecord): number[] {
  if (r.sessionMs && r.sessionMs.length > 0) return r.sessionMs.map((ms) => Math.round(ms / 1000));
  return [Math.round(Math.max(0, r.lastTs - r.firstTs) / 1000)];
}

export function activeTimestamps(r: SessionRecord): number[] {
  const all = r.sessionLog && r.sessionLog.length > 0 ? r.sessionLog.map((s) => s.ts) : [r.firstTs, r.lastTs];
  return r.engagedDays ? all.filter((ts) => r.engagedDays!.includes(dayStart(ts))) : all;
}

export function lastPointLabelCounts(
  records: SessionRecord[],
  now: number,
  coverage?: ActivityCoverage,
): { label24h: number | null; label168h: number | null; label720h: number | null; recordedLabel720h: number | null } {
  const events: { ts: number; cid: string }[] = [];
  for (const r of records) {
    for (const ts of activeTimestamps(r)) events.push({ ts, cid: r.cid.split('::')[0] });
  }
  if (events.length === 0) return { label24h: null, label168h: null, label720h: null, recordedLabel720h: null };
  const firstTs = events.reduce((first, event) => Math.min(first, event.ts), Infinity);
  return {
    label24h: rollingUniqueAt(events, now, ROLLING_24H_MS, firstTs),
    label168h: rollingUniqueAt(events, now, ROLLING_7D_MS, firstTs),
    label720h: coverage?.precision !== 'utc-days' && hasActivityCoverage(coverage, now - ROLLING_30D_MS, now)
      ? rollingUniqueAt(events, now, ROLLING_30D_MS, now - ROLLING_30D_MS) : null,
    recordedLabel720h: rollingUniqueAt(events, now, ROLLING_30D_MS, firstTs),
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
  /** Distinct browsers over this UTC day and the prior 29 days, with verified retention. */
  rolling30?: number | null;
  /** Lower bound from the activity still recorded; missing sessions cannot be recovered. */
  recordedRolling30?: number | null;
  /** Rolling 24h unique `cid` at `now` — set only on today's row when `now` is given. */
  label24h?: number | null;
  /** Rolling 168h unique `cid` at `now` — set only on today's row when `now` is given. */
  label168h?: number | null;
  label720h?: number | null;
  recordedLabel720h?: number | null;
  weeklyGrowth?: ActivityGrowth;
  monthlyGrowth?: ActivityGrowth;
};

export interface ImpliedActivityGrowth {
  days: number;
  start: number | null;
  end: number | null;
  weeklyPercent: number | null;
  monthlyPercent: number | null;
}

export function impliedActivityGrowth(
  series: Pick<DailyActivityPoint, 'day' | 'dau'>[], start: number | null, now: number,
): ImpliedActivityGrowth {
  const rows = series.filter(p => Number.isFinite(p.day) && Number.isFinite(p.dau) && p.dau >= 0
    && p.day < dayStart(now) && (start === null || p.day >= start)).sort((a, b) => a.day - b.day);
  const result: ImpliedActivityGrowth = { days: rows.length, start: rows[0]?.day ?? null,
    end: rows.length ? rows.at(-1)!.day + DAY_MS : null, weeklyPercent: null, monthlyPercent: null };
  if (rows.length < 2) return result;
  const times = rows.map(p => (p.day - rows[0].day) / DAY_MS);
  const total = rows.reduce((sum, p) => sum + p.dau, 0);
  if (!total) return result;
  const mean = rows.reduce((sum, p, i) => sum + times[i] * p.dau, 0) / total;
  if (mean <= times[0] || mean >= times.at(-1)!) return result;
  let lo = -40, hi = 40;
  for (let i = 0; i < 64; i++) {
    const slope = (lo + hi) / 2;
    const anchor = slope >= 0 ? times.at(-1)! : times[0];
    let weights = 0, weightedTime = 0;
    for (const time of times) {
      const weight = Math.exp(slope * (time - anchor));
      weights += weight;
      weightedTime += time * weight;
    }
    if (weightedTime / weights < mean) lo = slope;
    else hi = slope;
  }
  const slope = (lo + hi) / 2;
  const percent = (days: number) => {
    const value = Math.expm1(slope * days) * 100;
    return Number.isFinite(value) ? value : null;
  };
  return { ...result, weeklyPercent: percent(7), monthlyPercent: percent(30) };
}

interface ActivityCoverage {
  precision?: 'utc-days' | 'timestamps';
  retainedFrom: number;
  completeThrough: number;
  outages?: { start: number; end: number }[];
}

export type ActivityGrowth = {
  start: number;
  end: number;
  previousStart: number;
  previousEnd: number;
} & (
  | { status: 'available'; current: number; previous: number; percent: number | null }
  | { status: 'unavailable'; reason: 'missing coverage' | 'incomplete history' | 'recording outage' }
);

function activitySources(r: SessionRecord): ActivitySourceCoverage[] {
  return r.activityCoverageSources ?? [{
    firstTs: r.firstTs, lastTs: r.lastTs, from: r.activityCoverageFrom,
    hasDays: Array.isArray(r.activeDays) && r.activeDays.every(day => Number.isFinite(day) && day === dayStart(day)),
  }];
}

function retainedCalendarCoverage(records: SessionRecord[], now: number, start: number): ActivityCoverage | undefined {
  if (records.length === 0) return undefined;
  const retainedFrom = dayStart(now) - 89 * DAY_MS;
  if (start < retainedFrom) return undefined;
  let observedCoverage = false;
  for (const record of records) {
    for (const source of activitySources(record)) {
      if (!Number.isFinite(source.firstTs) || !Number.isFinite(source.lastTs)
        || source.firstTs < 0 || source.lastTs < source.firstTs) return undefined;
      const from = source.from ?? NaN;
      const sameDaySkew = source.firstTs - from <= 5 * 60_000 && dayStart(from) === dayStart(source.firstTs);
      const covered = source.hasDays && Number.isFinite(from)
        && from >= 0 && from <= now && (from >= source.firstTs || sameDaySkew);
      observedCoverage ||= covered;
      if (source.lastTs < start) continue;
      if (!covered || dayStart(from) > Math.max(dayStart(source.firstTs), start)) return undefined;
    }
  }
  return observedCoverage ? { precision: 'utc-days', retainedFrom: start, completeThrough: now } : undefined;
}

function calendarDays(r: SessionRecord, now?: number): number[] {
  const days = activeTimestamps(r).map(dayStart);
  if (r.activityCoverageFrom == null || !Number.isFinite(r.activityCoverageFrom)) return days;
  const opening = Math.max(dayStart(r.activityCoverageFrom), now == null ? -Infinity : dayStart(now) - 89 * DAY_MS);
  const end = now == null ? Infinity : dayStart(now);
  // An engaged day can be in neither source, such as a seen day whose beacon left after midnight.
  for (const day of r.engagedDays ?? r.activeDays ?? []) {
    if (Number.isFinite(day) && day === dayStart(day) && day >= opening && day <= end) days.push(day);
  }
  return days;
}

function hasActivityCoverage(coverage: ActivityCoverage | undefined, start: number, end: number): boolean {
  return coverage != null && Number.isFinite(coverage.retainedFrom) && Number.isFinite(coverage.completeThrough)
    && coverage.retainedFrom <= start && coverage.completeThrough >= end
    && start >= Date.UTC(2026, 8, 26)
    && !coverage.outages?.some(outage => !Number.isFinite(outage.start) || !Number.isFinite(outage.end)
      || outage.start < end && outage.end > start);
}

export function activityGrowth(
  records: SessionRecord[],
  now: number,
  days: 7 | 30,
  coverage?: ActivityCoverage,
): ActivityGrowth {
  const end = dayStart(now);
  const start = end - days * DAY_MS;
  const previousStart = start - days * DAY_MS;
  const dates = { start, end, previousStart, previousEnd: start };
  coverage ??= retainedCalendarCoverage(records, now, previousStart);
  if (!coverage) return { ...dates, status: 'unavailable', reason: 'missing coverage' };
  if (!Number.isFinite(coverage.retainedFrom) || !Number.isFinite(coverage.completeThrough)
    || coverage.retainedFrom > previousStart || coverage.completeThrough < end) {
    return { ...dates, status: 'unavailable', reason: 'incomplete history' };
  }
  // The quota outage before September 26 cannot be reconstructed from records.
  if (previousStart < Date.UTC(2026, 8, 26)
    || coverage.outages?.some(outage => !Number.isFinite(outage.start) || !Number.isFinite(outage.end)
      || outage.start < end && outage.end > previousStart)) {
    return { ...dates, status: 'unavailable', reason: 'recording outage' };
  }
  const current = new Set<string>();
  const previous = new Set<string>();
  for (const r of records) {
    const cid = r.cid.split('::')[0];
    for (const ts of calendarDays(r, now)) {
      if (ts >= start && ts < end) current.add(cid);
      else if (ts >= previousStart && ts < start) previous.add(cid);
    }
  }
  return {
    ...dates, status: 'available', current: current.size, previous: previous.size,
    percent: previous.size === 0 ? null : (current.size - previous.size) / previous.size * 100,
  };
}

export function dailyActive(records: SessionRecord[], now?: number, coverage?: ActivityCoverage): DailyActivityPoint[] {
  const sets: Record<number, Set<string>> = {};
  const events: { ts: number; cid: string }[] = [];
  for (const r of records) {
    for (const ts of activeTimestamps(r)) {
      const cid = r.cid.split('::')[0];
      events.push({ ts, cid });
    }
    for (const day of calendarDays(r, now)) {
      (sets[day] ??= new Set()).add(r.cid.split('::')[0]);
    }
  }
  const dayKeys = Object.keys(sets).map(Number);
  if (dayKeys.length === 0) return [];
  const firstTs = events.length ? events.reduce((first, event) => Math.min(first, event.ts), Infinity) : 0;
  const firstDay = dayKeys.reduce((first, day) => Math.min(first, day), Infinity);
  const lastActivity = dayKeys.reduce((last, day) => Math.max(last, day), -Infinity);
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
    const calendarCoverage = coverage ?? (now == null ? undefined : retainedCalendarCoverage(records, now, day - 29 * DAY_MS));
    const calendarComplete = hasActivityCoverage(calendarCoverage, day - 29 * DAY_MS, Math.min(day + DAY_MS, now ?? day + DAY_MS));
    if (day >= firstDay + 29 * DAY_MS || calendarComplete) {
      const monthly = new Set<string>();
      for (let d = day - 29 * DAY_MS; d <= day; d += DAY_MS) {
        for (const cid of sets[d] ?? []) monthly.add(cid);
      }
      row.recordedRolling30 = monthly.size;
      row.rolling30 = calendarComplete ? monthly.size : null;
    } else {
      row.rolling30 = null;
      row.recordedRolling30 = null;
    }
    if (todayStart !== null && now != null && day === todayStart) {
      row.label24h = rollingUniqueAt(events, now, ROLLING_24H_MS, firstTs);
      row.label168h = rollingUniqueAt(events, now, ROLLING_7D_MS, firstTs);
      row.label720h = coverage?.precision !== 'utc-days' && hasActivityCoverage(coverage, now - ROLLING_30D_MS, now)
        ? rollingUniqueAt(events, now, ROLLING_30D_MS, now - ROLLING_30D_MS) : null;
      row.recordedLabel720h = rollingUniqueAt(events, now, ROLLING_30D_MS, firstTs);
      row.weeklyGrowth = activityGrowth(records, now, 7, coverage);
      row.monthlyGrowth = activityGrowth(records, now, 30, coverage);
    }
    out.push(row);
  }
  return out;
}

export type HourlyActivityPoint = {
  hour: number;
  unique: number;
  /** Unique browsers in the 60 minutes before `now`; set only on the current hour's row. */
  pastHour?: number;
};

export function hourlyActive(records: SessionRecord[], now: number): HourlyActivityPoint[] {
  if (records.length === 0) return [];
  const sets: Record<number, Set<string>> = {};
  const pastHour = new Set<string>();
  for (const r of records) {
    for (const ts of activeTimestamps(r)) {
      const hour = hourStart(ts);
      (sets[hour] ??= new Set()).add(r.cid);
      if (ts > now - HOUR_MS && ts <= now) pastHour.add(r.cid);
    }
  }
  const lastHour = hourStart(now);
  const start = dayStart(now) - (HOURLY_WINDOW_DAYS - 1) * DAY_MS;
  const out: HourlyActivityPoint[] = [];
  for (let h = start; h <= lastHour; h += HOUR_MS) {
    out.push({ hour: h, unique: sets[h]?.size ?? 0 });
  }
  out[out.length - 1].pastHour = pastHour.size;
  return out;
}

export function retention(records: SessionRecord[]): { returning: number; newUsers: number } {
  let returning = 0;
  for (const r of records) {
    if (r.lastTs - r.firstTs >= DAY_MS) returning += 1;
  }
  return { returning, newUsers: records.length - returning };
}

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

export function tallies(records: SessionRecord[], field: TallyField): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of records) {
    const v = r[field];
    if (v) out[v] = (out[v] ?? 0) + 1;
  }
  return out;
}

const HEATMAP_CLOCKS = ['local', 'eastern'] as const;
export type HeatmapClock = (typeof HEATMAP_CLOCKS)[number];

const CLOCK_ZONE: Record<HeatmapClock, (r: SessionRecord) => string | undefined> = {
  local: (r) => r.tz,
  eastern: () => 'America/New_York',
};

const weekdayHourFormats = new Map<string, Intl.DateTimeFormat | null>();

function weekdayHourFormat(timeZone: string): Intl.DateTimeFormat | null {
  let fmt = weekdayHourFormats.get(timeZone);
  if (fmt === undefined) {
    try {
      fmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' });
    } catch {
      fmt = null;
    }
    weekdayHourFormats.set(timeZone, fmt);
  }
  return fmt;
}

function hourOfWeek(ts: number, timeZone: string): number | null {
  const parts = weekdayHourFormat(timeZone)?.formatToParts(ts);
  if (!parts) return null;
  const dow = DOW_NAMES.indexOf(parts.find((p) => p.type === 'weekday')?.value ?? '');
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  return dow >= 0 && Number.isInteger(hour) ? dow * 24 + hour : null;
}

export function heatmaps(records: SessionRecord[], start: number | null = null): Record<HeatmapClock, number[][]> {
  const week = () => Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const out: Record<HeatmapClock, number[][]> = { local: week(), eastern: week() };
  for (const r of records) {
    const times = activeTimestamps(r).filter((ts) => start === null || ts > start);
    for (const clock of HEATMAP_CLOCKS) {
      const zone = CLOCK_ZONE[clock](r);
      if (!zone) continue;
      const hours = new Set<number>();
      for (const ts of times) {
        const h = hourOfWeek(ts, zone);
        if (h !== null) hours.add(h);
      }
      for (const h of hours) out[clock][Math.floor(h / 24)][h % 24] += 1;
    }
  }
  return out;
}

export interface WhoBucket {
  country: string;
  lang: string;
  locale: string;
  switched: string;
  device: string;
  os: string;
  browser: string;
  n: number;
}

export interface Aggregates {
  users: number;
  activity: DailyActivityPoint[];
  hourly: HourlyActivityPoint[];
  retention: { returning: number; newUsers: number };
  timeCurves: Record<'longest' | 'first' | 'all', SurvivalCurve>;
  countries: Record<string, number>;
  languages: Record<string, number>;
  locales: Record<string, number>;
  devices: Record<string, number>;
  os: Record<string, number>;
  browsers: Record<string, number>;
  joints: PlatformJoint[];
  whoBuckets: WhoBucket[];
  heatmaps: Record<HeatmapClock, number[][]>;
}

export function aggregate(
  records: SessionRecord[],
  now: number,
  inRange = records,
  start: number | null = null,
  activityCoverage?: ActivityCoverage,
  activityRecords = records,
): Aggregates {
  return {
    users: inRange.length,
    activity: dailyActive(activityRecords, now, activityCoverage),
    hourly: hourlyActive(activityRecords, now),
    retention: retention(inRange),
    timeCurves: sessionCurves(inRange),
    countries: tallies(inRange, 'country'),
    languages: tallies(inRange, 'lang'),
    locales: tallies(inRange, 'locale'),
    devices: tallies(inRange, 'device'),
    os: tallies(inRange, 'os'),
    browsers: tallies(inRange, 'browser'),
    joints: tallyJoints(inRange),
    whoBuckets: tallyWhoBuckets(inRange),
    heatmaps: heatmaps(inRange, start),
  };
}

function tallyWhoBuckets(records: SessionRecord[]): WhoBucket[] {
  const map = new Map<string, WhoBucket>();
  for (const r of records) {
    const country = (r.country ?? '').toUpperCase();
    const lang = r.lang ?? '';
    const locale = r.locale ?? '';
    const switched = r.switched ?? '';
    const device = r.device || 'Unknown';
    const os = r.os || 'Unknown';
    const browser = r.browser || 'Unknown';
    const k = `${country}\t${lang}\t${locale}\t${switched}\t${device}\t${os}\t${browser}`;
    const cur = map.get(k);
    if (cur) cur.n += 1;
    else map.set(k, { country, lang, locale, switched, device, os, browser, n: 1 });
  }
  return [...map.values()].sort(
    (a, b) => b.n - a.n || a.country.localeCompare(b.country) || a.lang.localeCompare(b.lang),
  );
}

export interface PlatformJoint {
  device: string;
  os: string;
  browser: string;
  n: number;
}

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

export interface Referrable {
  cid: string;
  firstReferrer?: string;
}

export interface ReferrerFlowEntry {
  host: string;
  total: number;
  dex: number;
  league: number;
  favorites?: number;
}

export const UNKNOWN_REFERRER_HOST = 'referrer not known';

const TOP_REFERRER_HOSTS = 8;

export function referrerFlow(dexRecords: Referrable[], leagueRecords: Referrable[], favoriteRecords?: Referrable[]): ReferrerFlowEntry[] {
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
  const favoriteByHost = byHost(favoriteRecords ?? []);
  const hosts = new Set([...dexByHost.keys(), ...leagueByHost.keys(), ...favoriteByHost.keys()]);
  const rows = [...hosts].map((host) => {
    const dexCids = dexByHost.get(host) ?? new Set<string>();
    const leagueCids = leagueByHost.get(host) ?? new Set<string>();
    const favoriteCids = favoriteByHost.get(host) ?? new Set<string>();
    return { host, total: new Set([...dexCids, ...leagueCids, ...favoriteCids]).size, dex: dexCids.size, league: leagueCids.size, ...(favoriteRecords ? {favorites:favoriteCids.size}: {}) };
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

/** What a browser exported from the gym leader maker, as one outcome: a
 *  browser that exported a league and a gym card counts as `both` only. */
export const LEAGUE_EXPORT_ENDS = ['league', 'both', 'card'] as const;
export type LeagueExportEnd = (typeof LEAGUE_EXPORT_ENDS)[number];
export type LeagueExportCounts = Record<LeagueExportEnd, number>;

/** League gym-completion bucket. `exports` counts the people in this bucket
 *  under one export end each. Incomplete buckets keep non-exporters in the
 *  bucket. Full league peels them to Kept private. */
export interface LeagueGymBucket {
  label: string;
  count: number;
  exports: LeagueExportCounts;
}

export interface DexUsageFunnel {
  opened: number;
  built: number;
  bounced: number;
  buckets: DexSizeBucket[];
  completed: number;
  exported: number;
  keptPrivate: number;
}

export interface LeagueUsageFunnel {
  opened: number;
  placed: number;
  bounced: number;
  oneGymFull: number;
  cardNotFinished: number;
  gymBuckets: LeagueGymBucket[];
  fullLeague: number;
  exports: LeagueExportCounts;
  keptPrivate: number;
}

interface SizeTier {
  label: string;
  min: number;
  max: number;
}

const DEX_SIZE_BUCKETS: readonly SizeTier[] = [
  { label: '1–30', min: 0, max: 30 },
  { label: '31–60', min: 31, max: 60 },
  { label: '61–90', min: 61, max: 90 },
  { label: '91–120', min: 91, max: 120 },
  { label: '121–150', min: 121, max: Number.POSITIVE_INFINITY },
];

const LEAGUE_GYM_BUCKETS: readonly SizeTier[] = [
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

interface LeagueFunnelRow {
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

function leagueExportEnd(r: LeagueFunnelRow): LeagueExportEnd | null {
  if (r.exportsLeague > 0) return r.exportsCard > 0 ? 'both' : 'league';
  return r.exportsCard > 0 ? 'card' : null;
}

function leagueExports(rows: LeagueFunnelRow[]): LeagueExportCounts {
  const exports: LeagueExportCounts = { league: 0, both: 0, card: 0 };
  for (const r of rows) {
    const end = leagueExportEnd(r);
    if (end) exports[end] += 1;
  }
  return exports;
}

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
    return { label: t.label, count: inBucket.length, exports: leagueExports(inBucket) };
  }).filter((b) => b.count > 0);
  const fullLeagueRows = gymRows.filter((r) => r.fullGyms >= CARD_COUNT);
  const fullLeague = fullLeagueRows.length;
  const keptPrivate = fullLeagueRows.filter((r) => leagueExportEnd(r) === null).length;
  return {
    opened,
    placed,
    bounced,
    oneGymFull,
    cardNotFinished,
    gymBuckets,
    fullLeague,
    exports: leagueExports(gymRows),
    keptPrivate,
  };
}

export function funnelEventCount(events: Record<string, number> | undefined, name: string): number {
  if (!events) return 0;
  const underscored = name.replace(/-/g, '_');
  const n = events[name] ?? events[underscored];
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

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
      const newer = r.lastTs >= prev.lastTs ? r : prev;
      const timed = [...timedSessions(prev), ...timedSessions(r)].sort((a, b) => a.ts - b.ts);
      byCid.set(cid, {
        ...newer,
        cid,
        firstTs: Math.min(prev.firstTs, r.firstTs),
        lastTs: Math.max(prev.lastTs, r.lastTs),
        activeDays: [...new Set([...(prev.activeDays ?? []), ...(r.activeDays ?? [])])].sort((a, b) => a - b),
        ...(prev.engagedDays || r.engagedDays
          ? { engagedDays: [...new Set([...activityDays(prev), ...activityDays(r)])].sort((a, b) => a - b) }
          : {}),
        activityCoverageFrom: prev.activityCoverageFrom == null ? r.activityCoverageFrom
          : r.activityCoverageFrom == null ? prev.activityCoverageFrom : Math.min(prev.activityCoverageFrom, r.activityCoverageFrom),
        activityCoverageSources: [...activitySources(prev), ...activitySources(r)],
        sessions: (prev.sessions ?? 0) + (r.sessions ?? 0) || undefined,
        sessionMs: timed.map((t) => t.ms),
        sessionLog: timed.map((t) => ({ ts: t.ts })),
      });
    }
  }
  return [...byCid.values()];
}

/** The days a record is active on, after its engaged-day filter. */
function activityDays(r: SessionRecord): number[] {
  return r.engagedDays ?? [...activeTimestamps(r).map(dayStart), ...(r.activeDays ?? [])];
}

function timedSessions(r: SessionRecord): { ts: number; ms: number }[] {
  const log = r.sessionLog ?? [];
  const ms = r.sessionMs ?? [];
  const n = Math.min(log.length, ms.length);
  if (n === 0) {
    return [{ ts: r.firstTs, ms: Math.max(0, r.lastTs - r.firstTs) }];
  }
  const out: { ts: number; ms: number }[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ ts: log[log.length - n + i].ts, ms: ms[ms.length - n + i] });
  }
  return out;
}

export type Span = { start: number; end: number };

export type ToolUsage = {
  sessions: number;
  totalMs: number;
  spans: Span[];
};

const BROWSER_SESSION_GAP_MS = Math.max(LEAGUE_SESSION_GAP_MS, FAVORITE_SESSION_GAP_MS);

const sumMs = (ms: readonly number[] | undefined) =>
  (ms ?? []).reduce((a, b) => a + (Number.isFinite(b) && b > 0 ? b : 0), 0);

export function endStampedUsage(rec: {
  sessions?: number;
  sessionMs?: number[];
  sessionLog?: { ts: number }[];
}): ToolUsage {
  const log = rec.sessionLog ?? [];
  const ms = alignSessionMs(log.length, rec.sessionMs ?? []);
  const spans: Span[] = [];
  log.forEach((entry, i) => {
    if (!Number.isFinite(entry.ts)) return;
    const dur = Number.isFinite(ms[i]) && ms[i] > 0 ? ms[i] : 0;
    spans.push({ start: entry.ts - dur, end: entry.ts });
  });
  return { sessions: rec.sessions ?? rec.sessionMs?.length ?? 0, totalMs: sumMs(rec.sessionMs), spans };
}

export function spanUsage(rec: {
  sessions?: number;
  sessionMs?: number[];
  sessionLog?: { ts: number; endTs: number }[];
}): ToolUsage {
  const spans = (rec.sessionLog ?? [])
    .filter((s) => Number.isFinite(s.ts) && Number.isFinite(s.endTs) && s.endTs >= s.ts)
    .map((s) => ({ start: s.ts, end: s.endTs }));
  return { sessions: rec.sessions ?? spans.length, totalMs: sumMs(rec.sessionMs), spans };
}

export function browserTotal(tools: readonly ToolUsage[]): { sessions: number; totalMs: number } {
  const spans = tools.flatMap((t) => t.spans).sort((a, b) => a.start - b.start || a.end - b.end);
  let visits = 0;
  let unionMs = 0;
  let visitEnd = -Infinity;
  let runStart = 0;
  let runEnd = -Infinity;
  for (const s of spans) {
    if (s.start > visitEnd + BROWSER_SESSION_GAP_MS) visits += 1;
    visitEnd = Math.max(visitEnd, s.end);
    if (s.start > runEnd) {
      if (runEnd > -Infinity) unionMs += runEnd - runStart;
      runStart = s.start;
      runEnd = s.end;
    } else {
      runEnd = Math.max(runEnd, s.end);
    }
  }
  if (runEnd > -Infinity) unionMs += runEnd - runStart;

  let sessions = visits;
  let totalMs = unionMs;
  let busiest = 0;
  let longest = 0;
  for (const t of tools) {
    const loggedMs = t.spans.reduce((a, s) => a + (s.end - s.start), 0);
    sessions += Math.max(0, t.sessions - t.spans.length);
    totalMs += Math.max(0, t.totalMs - loggedMs);
    busiest = Math.max(busiest, t.sessions);
    longest = Math.max(longest, t.totalMs);
  }
  return { sessions: Math.max(sessions, busiest), totalMs: Math.max(totalMs, longest) };
}
