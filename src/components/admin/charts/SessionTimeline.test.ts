import { describe, expect, it } from 'vitest';
import {
  fmtRange,
  formatSessionMeta,
  midnightBoundaries,
  weekBoundaries,
  showDayLines,
  distinctCalendarDays,
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
    const t0 = Date.parse('2026-09-09T12:00:00Z');
    const t1 = Date.parse('2026-09-13T12:00:00Z');
    const days = midnightBoundaries(t0, t1);
    const weeks = weekBoundaries(t0, t1);
    expect(days.length).toBeGreaterThan(weeks.length);
    expect(weeks.every((ts) => days.includes(ts))).toBe(true);
  });

  it('marks local midnight in the given timezone, not UTC', () => {
    const t0 = Date.parse('2026-09-10T02:00:00Z');
    const t1 = Date.parse('2026-09-11T10:00:00Z');
    const ny = midnightBoundaries(t0, t1, 'America/New_York');
    expect(ny).toContain(Date.parse('2026-09-10T04:00:00Z'));
    expect(ny).not.toContain(Date.parse('2026-09-10T00:00:00Z'));
  });
});

describe('showDayLines', () => {
  it('shows day midnights when the span does not cover two week boundaries', () => {
    const t0 = Date.parse('2026-09-09T12:00:00Z');
    const t1 = Date.parse('2026-09-13T12:00:00Z');
    expect(showDayLines(t0, t1, 'UTC')).toBe(true);
    expect(weekBoundaries(t0, t1, 'UTC').length).toBeLessThan(2);
  });

  it('hides day midnights once the span reaches from one week to the week two weeks later', () => {
    const t0 = Date.parse('2026-09-01T12:00:00Z');
    const t1 = Date.parse('2026-09-20T12:00:00Z');
    expect(weekBoundaries(t0, t1, 'UTC').length).toBeGreaterThanOrEqual(2);
    expect(showDayLines(t0, t1, 'UTC')).toBe(false);
  });
});

describe('distinctCalendarDays', () => {
  it('counts days in the viewed user zone, not UTC and not the viewer zone', () => {
    const a = Date.parse('2026-09-10T02:00:00Z');
    const b = Date.parse('2026-09-10T10:00:00Z');
    expect(distinctCalendarDays([a, b], 'UTC')).toBe(1);
    expect(distinctCalendarDays([a, b], 'America/New_York')).toBe(2);
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

  it('gives a session that rounds to 0 minutes in seconds', () => {
    const cur: TimelinePoint = { t: Date.parse('2026-09-13T12:01:00Z'), count: 14, net: 0, added: 0, removed: 0, dur: 12 };
    expect(formatSessionMeta(cur, 'UTC').window).toBe('12:00–12:01 PM · 12s');
    expect(formatSessionMeta({ ...cur, dur: 0 }, 'UTC').window).toBe('12:01–12:01 PM · 0s');
  });
});
