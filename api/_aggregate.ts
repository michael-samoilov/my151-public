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

export const DAY_MS = 86_400_000;

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

/**
 * Dense daily active-users series with a trailing-7-day rolling count.
 *
 * `dau` is distinct browsers that day; `rolling7` is distinct browsers over
 * that day and the prior six — a WAU that updates daily, not a sum of DAUs, so
 * a browser active twice in a week counts once. Gaps are filled, so the lines
 * run unbroken from the first active day through `now` (UTC today when given).
 */
export function dailyActive(records: SessionRecord[], now?: number): { day: number; dau: number; rolling7: number }[] {
  const sets: Record<number, Set<string>> = {};
  for (const r of records) {
    for (const day of new Set(activeTimestamps(r).map(dayStart))) {
      (sets[day] ??= new Set()).add(r.cid);
    }
  }
  const dayKeys = Object.keys(sets).map(Number);
  if (dayKeys.length === 0) return [];
  const firstDay = Math.min(...dayKeys);
  const lastActivity = Math.max(...dayKeys);
  const lastDay = now != null ? Math.max(lastActivity, dayStart(now)) : lastActivity;
  const out: { day: number; dau: number; rolling7: number }[] = [];
  for (let day = firstDay; day <= lastDay; day += DAY_MS) {
    const roll = new Set<string>();
    for (let d = day - 6 * DAY_MS; d <= day; d += DAY_MS) {
      const s = sets[d];
      if (s) for (const cid of s) roll.add(cid);
    }
    out.push({ day, dau: sets[day]?.size ?? 0, rolling7: roll.size });
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

/** Everything the dashboard shows for one tool's records. */
export interface Aggregates {
  users: number;
  activity: { day: number; dau: number; rolling7: number }[];
  retention: { returning: number; activeLast7: number; newUsers: number };
  timeCurves: Record<'longest' | 'first' | 'all', SurvivalCurve>;
  countries: Record<string, number>;
  languages: Record<string, number>;
  locales: Record<string, number>;
  devices: Record<string, number>;
  os: Record<string, number>;
  browsers: Record<string, number>;
  hours: number[];
  heatmap: number[][];
}

/** Every aggregation above, over one record list. */
export function aggregate(records: SessionRecord[], now: number): Aggregates {
  const hm = heatmap(records);
  return {
    users: records.length,
    activity: dailyActive(records, now),
    retention: retention(records, now),
    timeCurves: sessionCurves(records),
    countries: tallies(records, 'country'),
    languages: tallies(records, 'lang'),
    locales: tallies(records, 'locale'),
    devices: tallies(records, 'device'),
    os: tallies(records, 'os'),
    browsers: tallies(records, 'browser'),
    hours: hm.hours,
    heatmap: hm.matrix,
  };
}

/** One cohort's size and device/country/browser mix — the built/incomplete/
 *  completed toggle on the dashboard tallies the same three fields three
 *  times, once per slice. */
export interface Cohort {
  users: number;
  devices: Record<string, number>;
  countries: Record<string, number>;
  browsers: Record<string, number>;
}

/** Tally one slice of records into a `Cohort`. The caller decides what the
 *  slice is (all records, or filtered by some record-type-specific field like
 *  `completed`); this only knows how to count what is already in the slice. */
export function tallyCohort(records: SessionRecord[]): Cohort {
  return {
    users: records.length,
    devices: tallies(records, 'device'),
    countries: tallies(records, 'country'),
    browsers: tallies(records, 'browser'),
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

/**
 * Referrer hosts ranked by distinct browsers reached, across both stores.
 *
 * `firstReferrer` is forward-only (see api/_leagueRecord.ts), so records
 * written before it existed carry no host and are skipped rather than
 * counted as "direct". A dex record's cid is split the same way `mergeByCid`
 * does, so a country-split record still counts as one browser. Capped at the
 * top 8 hosts by total reach.
 */
export function referrerFlow(dexRecords: Referrable[], leagueRecords: Referrable[]): ReferrerFlowEntry[] {
  const byHost = (records: Referrable[]) => {
    const out = new Map<string, Set<string>>();
    for (const r of records) {
      if (!r.firstReferrer) continue;
      const cid = r.cid.split('::')[0];
      const set = out.get(r.firstReferrer) ?? new Set<string>();
      set.add(cid);
      out.set(r.firstReferrer, set);
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
  return rows.sort((a, b) => b.total - a.total).slice(0, 8);
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
