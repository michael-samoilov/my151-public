import { describe, expect, it } from 'vitest';
import {
  alignSessionMs,
  isSubsetRegression,
  parseCapturedAt,
  sessionTarget,
  sortSessions,
  withoutDropRestorePhantoms,
} from '../../api/_sessionize';

describe('alignSessionMs', () => {
  it('keeps the most recent durations when the log is shorter', () => {
    expect(alignSessionMs(2, [10, 20, 30])).toEqual([20, 30]);
  });

  it('pads the front when the log is longer, matching end-alignment', () => {
    expect(alignSessionMs(3, [20, 30])).toEqual([0, 20, 30]);
  });
});

describe('sessionTarget', () => {
  it('inserts at 0 on an empty log', () => {
    expect(sessionTarget([], [], 100, 30_000)).toEqual({ kind: 'insert', index: 0 });
  });

  it('joins a timestamp that sits inside a session interval', () => {
    expect(sessionTarget([100, 200], [50, 10], 90, 30)).toEqual({ kind: 'join', index: 0 });
    expect(sessionTarget([100, 200], [50, 10], 195, 30)).toEqual({ kind: 'join', index: 1 });
  });

  it('inserts between sessions when the hole is larger than the gap', () => {
    expect(sessionTarget([100, 400], [20, 20], 250, 30)).toEqual({ kind: 'insert', index: 1 });
  });
});

describe('sortSessions', () => {
  it('reorders the log and durations together by timestamp', () => {
    const { log, ms } = sortSessions(
      [{ ts: 300, n: 'c' }, { ts: 100, n: 'a' }, { ts: 200, n: 'b' }],
      [3, 1, 2],
    );
    expect(log.map((s) => s.n)).toEqual(['a', 'b', 'c']);
    expect(ms).toEqual([1, 2, 3]);
  });
});

describe('parseCapturedAt', () => {
  const received = Date.parse('2026-09-13T12:00:00Z');

  it('returns null when the client sent nothing usable', () => {
    expect(parseCapturedAt(undefined, received)).toBeNull();
    expect(parseCapturedAt('2026-09-13', received)).toBeNull();
    expect(parseCapturedAt(NaN, received)).toBeNull();
  });

  it('keeps a capture time that is in the past relative to arrival', () => {
    const captured = received - 45 * 60_000;
    expect(parseCapturedAt(captured, received)).toBe(captured);
  });

  it('rejects a capture time far in the future or before the product existed', () => {
    expect(parseCapturedAt(received + 60 * 60_000, received)).toBeNull();
    expect(parseCapturedAt(Date.parse('2019-01-01Z'), received)).toBeNull();
  });
});

describe('isSubsetRegression', () => {
  it('is true when every incoming id is already stored and some are missing', () => {
    expect(isSubsetRegression([1, 2], [1, 2, 3, 4])).toBe(true);
  });

  it('is false when the incoming set adds anything or is empty or equal', () => {
    expect(isSubsetRegression([1, 2, 9], [1, 2, 3])).toBe(false);
    expect(isSubsetRegression([], [1, 2])).toBe(false);
    expect(isSubsetRegression([1, 2], [1, 2])).toBe(false);
    expect(isSubsetRegression([1], [])).toBe(false);
  });
});

describe('withoutDropRestorePhantoms', () => {
  const ids = (s: { ids: number[] }) => s.ids;

  it('drops a middle sitting that is a subset of two agreeing neighbours', () => {
    const log = [
      { ids: [1, 2, 3, 4, 5, 6] },
      { ids: [1] },
      { ids: [1, 2, 3, 4, 5, 6] },
    ];
    expect(withoutDropRestorePhantoms(log, ids)).toEqual([log[0], log[2]]);
  });

  it('keeps a smaller sitting whose ids are not in the neighbours', () => {
    const log = [
      { ids: [1, 2, 3, 4] },
      { ids: [99] },
      { ids: [1, 2, 3, 4] },
    ];
    expect(withoutDropRestorePhantoms(log, ids)).toEqual(log);
  });

  it('drops a count-only 13→1→14 dip when the middle sitting has no ids', () => {
    const log = [
      { ids: [] as number[], cards: 13, seats: 74 },
      { ids: [], cards: 1, seats: 1 },
      { ids: [1, 2, 3], cards: 14, seats: 84 },
    ];
    const counts = (s: { cards: number; seats: number }) => ({ cards: s.cards, seats: s.seats });
    expect(withoutDropRestorePhantoms(log, ids, counts)).toEqual([log[0], log[2]]);
  });

  it('keeps an empty-id dip when the neighbours disagree on size', () => {
    const log = [
      { ids: [] as number[], cards: 13, seats: 74 },
      { ids: [], cards: 1, seats: 1 },
      { ids: [], cards: 3, seats: 8 },
    ];
    const counts = (s: { cards: number; seats: number }) => ({ cards: s.cards, seats: s.seats });
    expect(withoutDropRestorePhantoms(log, ids, counts)).toEqual(log);
  });
});
