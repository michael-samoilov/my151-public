import { DAY_MS, dayStart } from '../../../../api/_aggregate';

export interface DailyPoint {
  day: number;
  dau: number;
  rolling7: number;
}

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

/** Last-24h is today's unique DAU. Last-7d is API unique WAU (`rolling7`). */
export function windowCounts(series: DailyPoint[]): { hours24: number; days7: number | null } {
  if (series.length === 0) return { hours24: 0, days7: null };
  const last = series[series.length - 1];
  return { hours24: last.dau, days7: last.rolling7 };
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

export function monthLabelTicks(days: number[]): { idx: number; label: string }[] {
  if (days.length === 0) return [];
  const groups: { start: number; end: number; label: string }[] = [];
  for (let i = 0; i < days.length; i++) {
    const label = new Date(days[i]).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.end = i;
    else groups.push({ start: i, end: i, label });
  }
  return groups.map((g) => ({ idx: Math.floor((g.start + g.end) / 2), label: g.label }));
}

export type CountLabelSide = 'above' | 'below';

export interface CountLabelLayout {
  x: number;
  side: CountLabelSide;
  dailyY: number;
  weeklyY: number;
  yMax: number;
}

/** Place 24h/7d labels between the last two points, off the lines. */
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
