import { describe, expect, it } from 'vitest';
import { SESSION_GAP_MS } from '../../../api/_shared';
import { LEAGUE_SESSION_GAP_MS } from '../../../api/_leagueRecord';
import { FAVORITE_SESSION_GAP_MS } from '../../../api/_favoriteRecord';
import { browserTotal, endStampedUsage, spanUsage, type ToolUsage } from '../../../api/_aggregate';

const MIN = 60_000;
const T = Date.UTC(2026, 9, 1, 12);

function ended(spans: [number, number][], extra: { sessions?: number; olderMs?: number[] } = {}) {
  const ms = spans.map(([a, b]) => (b - a) * MIN);
  return endStampedUsage({
    sessions: extra.sessions ?? spans.length + (extra.olderMs?.length ?? 0),
    sessionMs: [...(extra.olderMs ?? []), ...ms],
    sessionLog: spans.map(([, b]) => ({ ts: T + b * MIN })),
  });
}

function picked(spans: [number, number][], sessions = spans.length) {
  return spanUsage({
    sessions,
    sessionMs: spans.map(([a, b]) => (b - a) * MIN),
    sessionLog: spans.map(([a, b]) => ({ ts: T + a * MIN, endTs: T + b * MIN })),
  });
}

const minutes = (r: { sessions: number; totalMs: number }) => ({ sessions: r.sessions, minutes: r.totalMs / MIN });

describe('browserTotal', () => {
  it('counts two tools open at once as one session, and their shared minutes once', () => {
    expect(minutes(browserTotal([ended([[0, 40]]), ended([[30, 50]])]))).toEqual({ sessions: 1, minutes: 50 });
  });

  it('joins a tool that starts within the gap, and counts no idle time between them', () => {
    expect(minutes(browserTotal([ended([[0, 10]]), picked([[25, 40]])]))).toEqual({ sessions: 1, minutes: 25 });
  });

  it('joins at exactly the gap and splits one millisecond past it', () => {
    const at = (gapMs: number) =>
      browserTotal([
        { sessions: 1, totalMs: 0, spans: [{ start: T, end: T }] },
        { sessions: 1, totalMs: 0, spans: [{ start: T + gapMs, end: T + gapMs }] },
      ]).sessions;
    expect(at(30 * MIN)).toBe(1);
    expect(at(30 * MIN + 1)).toBe(2);
  });

  it('never splits two sessions that one tool would join on its own gap', () => {
    for (const gap of [SESSION_GAP_MS, LEAGUE_SESSION_GAP_MS, FAVORITE_SESSION_GAP_MS]) {
      const a = { sessions: 1, totalMs: MIN, spans: [{ start: T, end: T + MIN }] };
      const b = { sessions: 1, totalMs: MIN, spans: [{ start: T + MIN + gap, end: T + 2 * MIN + gap }] };
      expect(browserTotal([a, b]).sessions).toBe(1);
    }
  });

  it('reads a Dex or League log stamp as the session end, and a Picker stamp as the start', () => {
    expect(minutes(browserTotal([ended([[0, 40]]), picked([[40, 50]])]))).toEqual({ sessions: 1, minutes: 50 });
  });

  it('pairs durations with log entries from the newest end', () => {
    const dex = ended([[100, 120]], { olderMs: [5 * MIN, 10 * MIN] });
    expect(dex.spans).toEqual([{ start: T + 100 * MIN, end: T + 120 * MIN }]);
    expect(minutes(dex)).toEqual({ sessions: 3, minutes: 35 });
    expect(minutes(browserTotal([dex, picked([[110, 130]])]))).toEqual({ sessions: 3, minutes: 45 });
  });

  it('counts older sessions that fell out of the log as visits of their own', () => {
    const spans: [number, number][] = Array.from({ length: 50 }, (_, i) => [i * 100, i * 100 + 10]);
    const dex = ended(spans, { sessions: 60 });
    expect(browserTotal([dex, picked([[2, 8]])]).sessions).toBe(60);
    expect(browserTotal([dex, picked([[-500, -490]])]).sessions).toBe(61);
  });

  it('counts every session of a record with no log as unlogged', () => {
    const legacy = endStampedUsage({ sessions: 2, sessionMs: [5 * MIN, 7 * MIN] });
    expect(legacy.spans).toEqual([]);
    expect(minutes(browserTotal([legacy]))).toEqual({ sessions: 2, minutes: 12 });
    expect(minutes(browserTotal([legacy, picked([[0, 10]])]))).toEqual({ sessions: 3, minutes: 22 });
  });

  it('falls back to the duration count on a Dex record with no session counter', () => {
    const dex = endStampedUsage({ sessionMs: [4 * MIN], sessionLog: [{ ts: T + 4 * MIN }] });
    expect(minutes(dex)).toEqual({ sessions: 1, minutes: 4 });
  });

  it('never reports fewer sessions or less time than the busiest tool', () => {
    const bridged = browserTotal([ended([[0, 10], [70, 80]]), picked([[35, 50]])]);
    expect(minutes(bridged)).toEqual({ sessions: 2, minutes: 35 });
    const overlapping = { sessions: 2, totalMs: 40 * MIN, spans: [{ start: T, end: T + 20 * MIN }, { start: T + 10 * MIN, end: T + 30 * MIN }] };
    expect(minutes(browserTotal([overlapping]))).toEqual({ sessions: 2, minutes: 40 });
  });

  it('counts a single-beacon session as a visit with no time', () => {
    expect(minutes(browserTotal([ended([[0, 0]]), picked([[90, 90]])]))).toEqual({ sessions: 2, minutes: 0 });
  });

  it('gives the same answer for any order of tools and log entries', () => {
    const a = ended([[0, 10], [200, 230]]);
    const b = picked([[220, 260], [5, 15]]);
    const c = ended([[400, 410]]);
    const want = browserTotal([a, b, c]);
    expect(browserTotal([c, b, a])).toEqual(want);
    expect(browserTotal([b, a, c])).toEqual(want);
    expect(minutes(want)).toEqual({ sessions: 3, minutes: 15 + 60 + 10 });
  });

  it('skips a log entry with a broken stamp instead of placing it', () => {
    const dex = endStampedUsage({ sessions: 2, sessionMs: [5 * MIN, -1], sessionLog: [{ ts: Number.NaN }, { ts: T }] });
    expect(dex.spans).toEqual([{ start: T, end: T }]);
    expect(minutes(browserTotal([dex]))).toEqual({ sessions: 2, minutes: 5 });
  });

  it('stays between the busiest tool and the sum of the tools on random timelines', () => {
    let seed = 151;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const tool = (): ToolUsage => {
      const spans: [number, number][] = [];
      let at = Math.floor(rand() * 600);
      const n = 1 + Math.floor(rand() * 6);
      for (let i = 0; i < n; i++) {
        const len = Math.floor(rand() * 90);
        spans.push([at, at + len]);
        at += len + 31 + Math.floor(rand() * 600);
      }
      const older = rand() < 0.2 ? Math.floor(rand() * 5) : 0;
      return rand() < 0.5 ? ended(spans, { sessions: spans.length + older }) : picked(spans, spans.length + older);
    };
    for (let run = 0; run < 2000; run++) {
      const tools = Array.from({ length: 1 + Math.floor(rand() * 3) }, tool);
      const total = browserTotal(tools);
      const sum = { sessions: 0, totalMs: 0 };
      const max = { sessions: 0, totalMs: 0 };
      for (const t of tools) {
        sum.sessions += t.sessions;
        sum.totalMs += t.totalMs;
        max.sessions = Math.max(max.sessions, t.sessions);
        max.totalMs = Math.max(max.totalMs, t.totalMs);
      }
      expect(total.sessions).toBeGreaterThanOrEqual(max.sessions);
      expect(total.sessions).toBeLessThanOrEqual(sum.sessions);
      expect(total.totalMs).toBeGreaterThanOrEqual(max.totalMs);
      expect(total.totalMs).toBeLessThanOrEqual(sum.totalMs);
      if (tools.length === 1) expect(total).toEqual({ sessions: tools[0].sessions, totalMs: tools[0].totalMs });
    }
  });
});
