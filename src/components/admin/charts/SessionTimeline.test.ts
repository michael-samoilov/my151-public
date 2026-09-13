import { describe, expect, it } from 'vitest';
import {
  fmtRange,
  formatSessionMeta,
  midnightBoundaries,
  weekBoundaries,
  type TimelinePoint,
} from './sessionTimelineMath';

describe('fmtRange', () => {
  const tz = 'UTC';
  it('drops a repeated period', () => {
    const a = Date.parse('2026-09-13T07:43:00Z');
    const b = Date.parse('2026-09-13T07:53:00Z');
    expect(fmtRange(a, b, tz)).toBe('7:43–7:53 AM');
  });

  it('keeps both periods when they differ', () => {
    const a = Date.parse('2026-09-13T11:59:00Z');
    const b = Date.parse('2026-09-13T12:01:00Z');
    expect(fmtRange(a, b, tz)).toBe('11:59 AM–12:01 PM');
  });
});

describe('midnightBoundaries', () => {
  it('marks every UTC midnight, not only Sunday', () => {
    const t0 = Date.parse('2026-09-09T12:00:00Z'); // Wednesday
    const t1 = Date.parse('2026-09-13T12:00:00Z'); // Sunday
    const days = midnightBoundaries(t0, t1);
    const weeks = weekBoundaries(t0, t1);
    expect(days.length).toBeGreaterThan(weeks.length);
    expect(weeks.every((ts) => days.includes(ts))).toBe(true);
  });

  it('marks local midnight in the given timezone, not UTC', () => {
    const t0 = Date.parse('2026-09-10T02:00:00Z');
    const t1 = Date.parse('2026-09-11T10:00:00Z');
    const ny = midnightBoundaries(t0, t1, 'America/New_York');
    // 2026-09-10 00:00 in America/New_York is 04:00 UTC (EDT, UTC−4).
    expect(ny).toContain(Date.parse('2026-09-10T04:00:00Z'));
    expect(ny).not.toContain(Date.parse('2026-09-10T00:00:00Z'));
  });

  it('hits a half-hour offset midnight (IST), not only whole UTC hours', () => {
    const t0 = Date.parse('2026-09-10T12:00:00Z');
    const t1 = Date.parse('2026-09-11T20:00:00Z');
    const ist = midnightBoundaries(t0, t1, 'Asia/Kolkata');
    // 2026-09-11 00:00 in IST is 2026-09-10 18:30 UTC.
    expect(ist).toContain(Date.parse('2026-09-10T18:30:00Z'));
  });
});

describe('formatSessionMeta', () => {
  it('keeps date, window, length, and both diffs', () => {
    const cur: TimelinePoint = {
      t: Date.parse('2026-09-13T12:01:00Z'),
      count: 14,
      net: 84,
      added: 84,
      removed: 84,
      dur: 2 * 60,
    };
    const meta = formatSessionMeta(cur, 'UTC');
    expect(meta.text).toBe('Sep 13 · 11:59 AM–12:01 PM · 2m · +84 −84');
  });

  it('pathological longest case stays one compact line', () => {
    const cur: TimelinePoint = {
      t: Date.parse('2026-09-13T16:38:00Z'),
      count: 151,
      net: 151,
      added: 151,
      removed: 151,
      dur: 999 * 60,
    };
    const line = `151 of 151 · ${formatSessionMeta(cur, 'UTC').text}`;
    expect(line.includes('Sep 13')).toBe(true);
    expect(line.includes('999m')).toBe(true);
    expect(line.includes('+151')).toBe(true);
    expect(line.includes('−151')).toBe(true);
    expect(line.length).toBeLessThan(70);
  });
});
