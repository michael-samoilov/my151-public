import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../../../../api/_aggregate';
import {
  countLabelLayout,
  extendThroughToday,
  monthLabelTicks,
  rollingSum7,
  splitProvisional,
  weekLineIndices,
  windowCounts,
} from './trendSeries';

const day = (n: number) => Date.UTC(2026, 8, n);

describe('rollingSum7', () => {
  it('stays null until a full 7-day window exists', () => {
    expect(rollingSum7([1, 1, 1, 1, 1, 1, 2])).toEqual([null, null, null, null, null, null, 8]);
  });
});

describe('extendThroughToday', () => {
  it('pads zero days from the last point through today', () => {
    const series = extendThroughToday(
      [
        { day: day(10), dau: 4 },
        { day: day(11), dau: 5 },
      ],
      day(13) + 18 * 3600_000,
    );
    expect(series.map((p) => p.day)).toEqual([day(10), day(11), day(12), day(13)]);
    expect(series.map((p) => p.dau)).toEqual([4, 5, 0, 0]);
  });

  it('leaves a series that already includes today alone', () => {
    const src = [{ day: day(13), dau: 3 }];
    expect(extendThroughToday(src, day(13) + 1000)).toEqual(src);
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

  it('steps back in 7-day increments across a longer series', () => {
    const origin = Date.UTC(2026, 5, 16);
    const last = Date.UTC(2026, 8, 13);
    const days: number[] = [];
    for (let d = origin; d <= last; d += DAY_MS) days.push(d);
    const now = Date.UTC(2026, 8, 13, 18, 0, 0);
    const lines = weekLineIndices(days, now);
    expect(lines.length).toBeGreaterThan(8);
    expect(lines[1]).toBeCloseTo(lines[0] - 7);
  });

  it('does not draw on the first or last category', () => {
    const days = [day(1), day(2), day(3)];
    expect(weekLineIndices(days, day(3) + 12 * 3600_000).every((i) => i > 0 && i < 2)).toBe(true);
  });
});

describe('monthLabelTicks', () => {
  it('centers one short-month label on each visible month', () => {
    const days: number[] = [];
    for (let d = Date.UTC(2026, 5, 16); d <= Date.UTC(2026, 8, 13); d += DAY_MS) days.push(d);
    const ticks = monthLabelTicks(days);
    expect(ticks.map((t) => t.label)).toEqual(['Jun', 'Jul', 'Aug', 'Sep']);
    expect(ticks[0].idx).toBe(Math.floor(14 / 2));
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

describe('windowCounts', () => {
  it('reads today as 24h and the trailing 7-day sum as 7d', () => {
    const series = Array.from({ length: 7 }, (_, i) => ({ day: day(7) + i * DAY_MS, dau: i + 1 }));
    expect(windowCounts(series)).toEqual({ hours24: 7, days7: 28 });
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
