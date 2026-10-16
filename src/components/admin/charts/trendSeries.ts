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

export function chartDailyValues(series: DailyPoint[]): number[] {
  if (series.length === 0) return [];
  const last = series.length - 1;
  return series.map((p, i) => {
    if (i === last && p.label24h != null) return p.label24h;
    return p.dau;
  });
}

const INCOMPLETE_WEEKLY_DAYS = 6;

export function sliceActivityRange(series: DailyPoint[], start: number | null): DailyPoint[] {
  if (start == null || series.length === 0) return series;
  const sliced = series.filter((p) => p.day + DAY_MS > start);
  if (sliced.length >= 2 || sliced.length === series.length) return sliced;
  return series.slice(Math.max(0, series.length - 2));
}

export function sliceHourlyRange(series: HourlyPoint[], nowMs: number): HourlyPoint[] {
  if (series.length === 0) return series;
  const last = hourStart(nowMs);
  const first = last - 23 * HOUR_MS;
  return series.filter((p) => p.hour >= first && p.hour <= last);
}

export function sliceLastUtcDays(series: DailyPoint[], nowMs: number, days: number): DailyPoint[] {
  if (series.length === 0 || days <= 0) return [];
  const last = dayStart(nowMs);
  const first = last - (days - 1) * DAY_MS;
  return series.filter((p) => p.day >= first && p.day <= last);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

interface WeekdayTick {
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

export function chartMonthlyValues(series: DailyPoint[]): (number | null)[] {
  const last = series.length - 1;
  return series.map((p, i) => {
    if (i === last) return p.label720h ?? p.recordedLabel720h ?? null;
    return p.rolling30 ?? p.recordedRolling30 ?? null;
  });
}

export function applyActivityLabels(
  series: DailyPoint[],
  nowMs: number,
  labels: { label24h?: number | null; label168h?: number | null; label720h?: number | null; recordedLabel720h?: number | null },
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
    label720h: labels.label720h ?? out[idx].label720h,
    recordedLabel720h: labels.recordedLabel720h ?? out[idx].recordedLabel720h,
  };
  return out;
}

export function windowCounts(series: DailyPoint[]): { hours24: number; days7: number | null } {
  if (series.length === 0) return { hours24: 0, days7: null };
  const last = series[series.length - 1];
  return {
    hours24: last.label24h ?? last.dau,
    days7: last.label168h ?? last.rolling7,
  };
}

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

interface MonthLabelTick {
  idx: number;
  abbr: string;
  year: number | null;
}

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

type CountLabelSide = 'above' | 'below';

interface CountLabelLayout {
  x: number;
  side: CountLabelSide;
  dailyY: number;
  weeklyY: number;
  yMax: number;
}

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
