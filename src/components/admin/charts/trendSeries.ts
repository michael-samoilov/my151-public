import { DAY_MS, dayStart } from '../../../../api/_aggregate';

export interface DailyPoint {
  day: number;
  dau: number;
}

export function rollingSum7(vals: number[]): (number | null)[] {
  return vals.map((_, i) => {
    if (i < 6) return null;
    return vals.slice(i - 6, i + 1).reduce((a, b) => a + b, 0);
  });
}

export function extendThroughToday(series: DailyPoint[], nowMs: number): DailyPoint[] {
  if (series.length === 0) return series;
  const today = dayStart(nowMs);
  const last = series[series.length - 1].day;
  if (last >= today) return series;
  const out = series.slice();
  for (let d = last + DAY_MS; d <= today; d += DAY_MS) {
    out.push({ day: d, dau: 0 });
  }
  return out;
}

export function lastPointIsToday(series: DailyPoint[], nowMs: number): boolean {
  const last = series[series.length - 1];
  return last != null && last.day === dayStart(nowMs);
}

export function sundayMidnightIndices(days: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < days.length; i++) {
    if (new Date(days[i]).getUTCDay() === 0) out.push(i);
  }
  return out;
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

export function headerCounts(series: DailyPoint[]): { daily: number; weekly: number | null } {
  if (series.length === 0) return { daily: 0, weekly: null };
  const weekly = rollingSum7(series.map((p) => p.dau));
  return { daily: series[series.length - 1].dau, weekly: weekly[weekly.length - 1] };
}
