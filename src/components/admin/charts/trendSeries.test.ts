import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../../../../api/_aggregate';
import { dayStart } from '../../../../api/_aggregate';
import { rangeStart } from '../../../../api/_range';
import {
  chartDailyValues,
  chartWeeklyValues,
  countLabelLayout,
  applyActivityLabels,
  extendThroughToday,
  monthDividerIndices,
  monthLabelTicks,
  sliceActivityRange,
  splitProvisional,
  weekLineIndices,
  windowCounts,
  type DailyPoint,
} from './trendSeries';

const day = (n: number) => Date.UTC(2026, 8, n);

describe('extendThroughToday', () => {
  it('pads zero days from the last point through today', () => {
    const series = extendThroughToday(
      [
        { day: day(10), dau: 4, rolling7: 4 },
        { day: day(11), dau: 5, rolling7: 6 },
      ],
      day(13) + 18 * 3600_000,
    );
    expect(series.map((p) => p.day)).toEqual([day(10), day(11), day(12), day(13)]);
    expect(series.map((p) => p.dau)).toEqual([4, 5, 0, 0]);
    expect(series.map((p) => p.rolling7)).toEqual([4, 6, 0, 0]);
  });
});

describe('weekLineIndices', () => {
  it('places the rightmost line exactly 7d before now', () => {
    const origin = Date.UTC(2026, 8, 1);
    const days = Array.from({ length: 13 }, (_, i) => origin + i * DAY_MS);
    const now = Date.UTC(2026, 8, 13, 18, 0, 0);
    const lines = weekLineIndices(days, now);
    expect(lines[0]).toBeCloseTo((now - 7 * DAY_MS - origin) / DAY_MS);
    expect(lines[0]).toBeCloseTo(5.75);
    expect(lines.every((i) => i > 0 && i < days.length - 1)).toBe(true);
  });
});

describe('monthLabelTicks', () => {
  it('left-aligns each month on its first day and years the first month', () => {
    const days: number[] = [];
    for (let d = Date.UTC(2026, 5, 16); d <= Date.UTC(2026, 8, 13); d += DAY_MS) days.push(d);
    const ticks = monthLabelTicks(days);
    expect(ticks).toEqual([
      { idx: 0, abbr: 'Jun', year: 2026 },
      { idx: days.findIndex((d) => new Date(d).getUTCMonth() === 6), abbr: 'Jul', year: null },
      { idx: days.findIndex((d) => new Date(d).getUTCMonth() === 7), abbr: 'Aug', year: null },
      { idx: days.findIndex((d) => new Date(d).getUTCMonth() === 8), abbr: 'Sep', year: null },
    ]);
  });

  it('years every January as well as the first month', () => {
    const days: number[] = [];
    for (let d = Date.UTC(2026, 11, 20); d <= Date.UTC(2027, 1, 5); d += DAY_MS) days.push(d);
    expect(monthLabelTicks(days)).toEqual([
      { idx: 0, abbr: 'Dec', year: 2026 },
      { idx: days.findIndex((d) => new Date(d).getUTCMonth() === 0), abbr: 'Jan', year: 2027 },
      { idx: days.findIndex((d) => new Date(d).getUTCMonth() === 1), abbr: 'Feb', year: null },
    ]);
  });
});

describe('monthDividerIndices', () => {
  it('sits between the last day of a month and the first of the next', () => {
    const days: number[] = [];
    for (let d = Date.UTC(2026, 5, 16); d <= Date.UTC(2026, 8, 13); d += DAY_MS) days.push(d);
    const lines = monthDividerIndices(days);
    expect(lines).toHaveLength(3);
    for (const x of lines) {
      const i = Math.floor(x);
      expect(x).toBe(i + 0.5);
      expect(new Date(days[i]).getUTCMonth()).not.toBe(new Date(days[i + 1]).getUTCMonth());
    }
  });
});

describe('splitProvisional', () => {
  it('splits the last segment so today can draw dotted', () => {
    expect(splitProvisional([1, 2, 3], true)).toEqual({
      complete: [1, 2, null],
      provisional: [null, 2, 3],
    });
  });

  it('keeps one series when today is not the last point', () => {
    expect(splitProvisional([1, 2], false)).toEqual({
      complete: [1, 2],
      provisional: [null, null],
    });
  });
});

describe('applyActivityLabels', () => {
  it('merges lastPointLabels onto today without changing calendar dau', () => {
    const now = day(13) + 12 * 3600_000;
    const series = applyActivityLabels([{ day: dayStart(now), dau: 99, rolling7: 50 }], now, {
      label24h: 7,
      label168h: 40,
    });
    expect(series[0].dau).toBe(99);
    expect(series[0].label24h).toBe(7);
    expect(series[0].label168h).toBe(40);
  });
});

describe('chartDailyValues', () => {
  it('uses calendar DAU except the last point when label24h is set', () => {
    const series = [
      { day: day(1), dau: 2, rolling7: 2 },
      { day: day(2), dau: 5, rolling7: 6, label24h: 7 },
    ];
    expect(chartDailyValues(series)).toEqual([2, 7]);
  });
});

function denseSeries(fromDay: number, count: number): DailyPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    day: fromDay + i * DAY_MS,
    dau: i + 1,
    rolling7: 10 + i,
  }));
}

describe('chartWeeklyValues', () => {
  it('does not plot the first 6 days of history and keeps later weekly points', () => {
    const series = denseSeries(day(1), 10);
    series[9] = { ...series[9], label168h: 88 };
    expect(chartWeeklyValues(series, series[0].day)).toEqual([null, null, null, null, null, null, 16, 17, 18, 88]);
  });

  it('does not blank a 28d slice whose days already have a full week behind them', () => {
    const full = denseSeries(day(1), 40);
    full[39] = { ...full[39], label168h: 99 };
    const origin = full[0].day;
    const now = day(40) + 12 * 3600_000;
    const visible = sliceActivityRange(full, rangeStart('28d', now));
    expect(visible).toHaveLength(29);
    const weekly = chartWeeklyValues(visible, origin);
    expect(weekly.slice(0, 6).every((v) => v != null)).toBe(true);
    expect(weekly[weekly.length - 1]).toBe(99);
  });
});

describe('windowCounts', () => {
  it('reads gutter labels from label24h and label168h on the last point', () => {
    const series = [
      { day: day(12), dau: 3, rolling7: 8 },
      { day: day(13), dau: 4, rolling7: 9, label24h: 11, label168h: 16 },
    ];
    expect(windowCounts(series)).toEqual({ hours24: 11, days7: 16 });
  });
});

describe('countLabelLayout', () => {
  it('sits between the last two points and above a wide daily/weekly gap', () => {
    const daily = [10, 12, 14];
    const weekly = [null, 70, 80];
    const layout = countLabelLayout(daily, weekly, 80);
    expect(layout).not.toBeNull();
    expect(layout!.x).toBe(1.5);
    expect(layout!.side).toBe('above');
    expect(layout!.dailyY).toBe(14);
    expect(layout!.weeklyY).toBe(80);
    expect(layout!.weeklyY).toBeGreaterThan(layout!.dailyY);
  });

  it('stacks both labels above the peak when the daily/weekly gap is tight', () => {
    const daily = [90, 95];
    const weekly = [96, 98];
    const layout = countLabelLayout(daily, weekly, 98);
    expect(layout).not.toBeNull();
    expect(layout!.side).toBe('above');
    expect(layout!.weeklyY).toBeGreaterThan(98);
    expect(layout!.dailyY).toBe(98);
  });
});
