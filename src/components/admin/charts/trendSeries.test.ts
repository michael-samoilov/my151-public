import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../../../../api/_aggregate';
import {
  extendThroughToday,
  headerCounts,
  rollingSum7,
  splitProvisional,
  sundayMidnightIndices,
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

describe('sundayMidnightIndices', () => {
  it('marks UTC Sunday midnights including the first day', () => {
    const sat12 = day(12);
    const sun13 = day(13);
    const mon14 = day(14);
    const sat19 = day(19);
    const sun20 = day(20);
    expect(sundayMidnightIndices([sat12, sun13, mon14, sat19, sun20])).toEqual([1, 4]);
  });

  it('includes index 0 when the series starts on Sunday', () => {
    expect(sundayMidnightIndices([day(13), day(14)])).toEqual([0]);
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

describe('headerCounts', () => {
  it('reads today daily and the trailing 7-day sum', () => {
    const series = Array.from({ length: 7 }, (_, i) => ({ day: day(7) + i * DAY_MS, dau: i + 1 }));
    expect(headerCounts(series)).toEqual({ daily: 7, weekly: 28 });
  });
});
