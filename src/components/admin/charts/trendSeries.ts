import { DAY_MS, HOUR_MS, dayStart, hourStart, type DailyActivityPoint, type HourlyActivityPoint } from '../../../../api/_aggregate';

export type DailyPoint = DailyActivityPoint;
export type HourlyPoint = HourlyActivityPoint;

export function extendThroughToday(series: DailyPoint[], nowMs: number): DailyPoint[] {
  if (series.length === 0) return series;
  const today = dayStart(nowMs);
  const last = series[series.length - 1].day;
  if (last >= today) return series;
  const out = series.slice();
  for (let d = last + DAY_MS; d <= today; d += DAY_MS) {
    out.push({ day: d, dau: 0, rolling7: 0 });
  }
  return out;
}

export function lastPointIsToday(series: DailyPoint[], nowMs: number): boolean {
  const last = series[series.length - 1];
  return last != null && last.day === dayStart(nowMs);
}

export function splitProvisional(
  values: (number | null)[],
  provisionalLast: boolean,
): { complete: (number | null)[]; provisional: (number | null)[] } {
  if (!provisionalLast || values.length < 2) {
    return { complete: values, provisional: values.map(() => null) };
  }
  const last = values.length - 1;
  return {
    complete: values.map((v, i) => (i === last ? null : v)),
    provisional: values.map((v, i) => (i >= last - 1 ? v : null)),
  };
}

/** Calendar DAU; last point uses `label24h` when the API set it (rolling 24h at now). */
export function chartDailyValues(series: DailyPoint[]): number[] {
  if (series.length === 0) return [];
  const last = series.length - 1;
  return series.map((p, i) => {
    if (i === last && p.label24h != null) return p.label24h;
    return p.dau;
  });
}

export const INCOMPLETE_WEEKLY_DAYS = 6;

/** The points from the bucket that holds `start` on, or the last two when
 *  fewer remain: a line needs two points. */
function fromStart<T>(series: T[], start: number | null, bucketOf: (p: T) => number, size: number): T[] {
  if (start == null || series.length === 0) return series;
  const sliced = series.filter((p) => bucketOf(p) + size > start);
  if (sliced.length >= 2 || sliced.length === series.length) return sliced;
  return series.slice(Math.max(0, series.length - 2));
}

/** Days that overlap the window opening at `start`; every day for `null`. */
export function sliceActivityRange(series: DailyPoint[], start: number | null): DailyPoint[] {
  return fromStart(series, start, (p) => p.day, DAY_MS);
}

/** The last 24 hours, from the hour that holds `start` on when it is later. */
export function sliceHourlyRange(series: HourlyPoint[], nowMs: number, start: number | null = null): HourlyPoint[] {
  if (series.length === 0) return series;
  const last = hourStart(nowMs);
  const first = last - 23 * HOUR_MS;
  return fromStart(series.filter((p) => p.hour >= first && p.hour <= last), start, (p) => p.hour, HOUR_MS);
}

/** The last `days` UTC days, from the day that holds `start` on when it is later. */
export function sliceLastUtcDays(series: DailyPoint[], nowMs: number, days: number, start: number | null = null): DailyPoint[] {
  if (series.length === 0 || days <= 0) return [];
  const last = dayStart(nowMs);
  const first = last - (days - 1) * DAY_MS;
  return fromStart(series.filter((p) => p.day >= first && p.day <= last), start, (p) => p.day, DAY_MS);
}

export type ActivityShape = 'hourly' | 'weekday' | 'trend';

/** The chart a window opening at `start` gets: hours for a day or less,
 *  weekdays for a week or less, then the daily trend. */
export function activityShape(start: number | null, nowMs: number): ActivityShape {
  const span = start === null ? Infinity : nowMs - start;
  return span <= DAY_MS ? 'hourly' : span <= 7 * DAY_MS ? 'weekday' : 'trend';
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export interface WeekdayTick {
  idx: number;
  weekday: (typeof WEEKDAYS)[number];
}

export function dailyWeekdayTicks(series: DailyPoint[]): WeekdayTick[] {
  return series.map((p, i) => ({
    idx: i,
    weekday: WEEKDAYS[new Date(p.day).getUTCDay()],
  }));
}

export function lastPointIsCurrentHour(series: HourlyPoint[], nowMs: number): boolean {
  const last = series[series.length - 1];
  return last != null && last.hour === hourStart(nowMs);
}

export function chartWeeklyValues(
  series: DailyPoint[],
  historyOriginDay: number,
): (number | null)[] {
  if (series.length === 0) return [];
  const last = series.length - 1;
  const completeFrom = historyOriginDay + INCOMPLETE_WEEKLY_DAYS * DAY_MS;
  return series.map((p, i) => {
    if (i === last && p.label168h != null) return p.label168h;
    if (p.day < completeFrom) return null;
    return p.rolling7;
  });
}

/** Merge server rolling labels onto today's activity row (from `byTool.*.activity`). */
export function applyActivityLabels(
  series: DailyPoint[],
  nowMs: number,
  labels: { label24h?: number | null; label168h?: number | null },
): DailyPoint[] {
  if (series.length === 0 || !nowMs) return series;
  const today = dayStart(nowMs);
  const idx = series.findIndex((p) => p.day === today);
  if (idx < 0) return series;
  const out = series.slice();
  out[idx] = {
    ...out[idx],
    label24h: labels.label24h ?? out[idx].label24h,
    label168h: labels.label168h ?? out[idx].label168h,
  };
  return out;
}

/** Gutter counts: rolling at `now` when computed, else same as production (DAU / calendar week). */
export function windowCounts(series: DailyPoint[]): { hours24: number; days7: number | null } {
  if (series.length === 0) return { hours24: 0, days7: null };
  const last = series[series.length - 1];
  return {
    hours24: last.label24h ?? last.dau,
    days7: last.label168h ?? last.rolling7,
  };
}

/**
 * Fractional category indices for week separators, stepping back 7d from now.
 * The rightmost line is exactly one week before `nowMs`.
 */
export function weekLineIndices(days: number[], nowMs: number): number[] {
  if (days.length < 2) return [];
  const origin = days[0];
  const lastIdx = days.length - 1;
  const out: number[] = [];
  for (let t = nowMs - 7 * DAY_MS; ; t -= 7 * DAY_MS) {
    const idx = (t - origin) / DAY_MS;
    if (idx <= 0) break;
    if (idx < lastIdx) out.push(idx);
  }
  return out;
}

export interface MonthLabelTick {
  idx: number;
  abbr: string;
  year: number | null;
}

/** First visible month, and every January, carry a year under the abbreviation. */
export function monthLabelTicks(days: number[]): MonthLabelTick[] {
  if (days.length === 0) return [];
  const groups: { start: number; month: number; year: number }[] = [];
  for (let i = 0; i < days.length; i++) {
    const d = new Date(days[i]);
    const month = d.getUTCMonth();
    const year = d.getUTCFullYear();
    const last = groups[groups.length - 1];
    if (last && last.month === month && last.year === year) continue;
    groups.push({ start: i, month, year });
  }
  return groups.map((g, gi) => {
    const abbr = new Date(days[g.start]).toLocaleDateString('en-US', {
      month: 'short',
      timeZone: 'UTC',
    });
    const withYear = gi === 0 || g.month === 0;
    return { idx: g.start, abbr, year: withYear ? g.year : null };
  });
}

/** Category indices halfway between the last day of a month and the first of the next.
 *  Drawn only in the x-axis label ribbon, not through the plot. */
export function monthDividerIndices(days: number[]): number[] {
  if (days.length < 2) return [];
  const out: number[] = [];
  for (let i = 0; i < days.length - 1; i++) {
    const a = new Date(days[i]);
    const b = new Date(days[i + 1]);
    if (a.getUTCMonth() !== b.getUTCMonth() || a.getUTCFullYear() !== b.getUTCFullYear()) {
      out.push(i + 0.5);
    }
  }
  return out;
}

export type CountLabelSide = 'above' | 'below';

export interface CountLabelLayout {
  x: number;
  side: CountLabelSide;
  dailyY: number;
  weeklyY: number;
  yMax: number;
}

/** Place 24h/7d labels at the last point's y, stacked if the daily/weekly gap is tight. */
export function countLabelLayout(
  daily: number[],
  weekly: (number | null)[],
  dataMax: number,
): CountLabelLayout | null {
  const last = daily.length - 1;
  if (last < 1) return null;
  const d0 = daily[last - 1];
  const d1 = daily[last];
  const w0 = weekly[last - 1];
  const w1 = weekly[last];
  const pair = [d0, d1, w0, w1].filter((v): v is number => v != null);
  if (pair.length === 0) return null;
  const dHi = Math.max(d0, d1);
  const wNums = [w0, w1].filter((v): v is number => v != null);
  const wHi = wNums.length ? Math.max(...wNums) : dHi;
  const wLo = wNums.length ? Math.min(...wNums) : dHi;
  const span = Math.max(dataMax, wHi, dHi, 1);
  const pad = span * 0.08;
  const gap = wLo - dHi;
  const x = last - 0.5;
  if (gap >= pad * 1.5) {
    return { x, side: 'above', dailyY: dHi, weeklyY: wHi, yMax: span };
  }
  return { x, side: 'above', dailyY: wHi, weeklyY: wHi + pad, yMax: wHi + pad * 1.6 };
}
