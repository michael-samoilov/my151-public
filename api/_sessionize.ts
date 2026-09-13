/**
 * Session targeting for out-of-order beacons.
 *
 * Both tools stamp a session by the time the snapshot was captured, not by
 * when the request reached the server. A delayed keepalive from an earlier
 * sitting must join that sitting (or be ignored as stale), not open a new
 * session after a later, fuller one. That mis-order is what made a league
 * look ~85% filled, then drop to one line, then restore.
 */

export type SessionTarget =
  | { kind: 'join'; index: number }
  | { kind: 'insert'; index: number };

/** Pair `sessionMs` with `sessionLog` from the end, the way both stores write them. */
export function alignSessionMs(logLen: number, ms: readonly number[]): number[] {
  if (logLen <= 0) return [];
  if (ms.length === logLen) return ms.slice();
  if (ms.length > logLen) return ms.slice(ms.length - logLen);
  return [...Array<number>(logLen - ms.length).fill(0), ...ms];
}

/**
 * Which existing session `now` belongs to, or where to insert a new one.
 *
 * A session is the interval `[end - duration, end]`. `now` joins the closest
 * session whose interval it falls within `gapMs` of. Otherwise it inserts so
 * the log stays sorted by end timestamp.
 */
export function sessionTarget(
  ends: readonly number[],
  durs: readonly number[],
  now: number,
  gapMs: number,
): SessionTarget {
  if (ends.length === 0) return { kind: 'insert', index: 0 };
  let best: { index: number; dist: number } | null = null;
  for (let i = 0; i < ends.length; i++) {
    const end = ends[i];
    const start = end - (durs[i] ?? 0);
    const dist = now < start ? start - now : now > end ? now - end : 0;
    if (dist <= gapMs && (best === null || dist < best.dist || (dist === best.dist && i > best.index))) {
      best = { index: i, dist };
    }
  }
  if (best) return { kind: 'join', index: best.index };
  let index = 0;
  while (index < ends.length && ends[index] <= now) index += 1;
  return { kind: 'insert', index };
}

/** Reorder a log and its durations together by timestamp. */
export function sortSessions<T extends { ts: number }>(
  log: readonly T[],
  ms: readonly number[],
): { log: T[]; ms: number[] } {
  const aligned = alignSessionMs(log.length, ms);
  const order = log.map((_, i) => i).sort((a, b) => log[a].ts - log[b].ts);
  return { log: order.map((i) => log[i]), ms: order.map((i) => aligned[i]) };
}

const PRODUCT_START_MS = Date.parse('2024-01-01T00:00:00.000Z');
const FUTURE_SKEW_MS = 5 * 60_000;

/**
 * The time the client captured this snapshot, or null when the payload omitted
 * one / sent junk. Null means the server must stamp arrival time and treat the
 * beacon as an old client (subset-regression guard applies).
 */
export function parseCapturedAt(v: unknown, receivedAt: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const ts = Math.round(v);
  if (ts < PRODUCT_START_MS || ts > receivedAt + FUTURE_SKEW_MS) return null;
  return ts;
}

/**
 * A late-arriving old-client beacon: no capturedAt, a new sitting by arrival
 * time, and a board that is a strict subset of what we already stored. That
 * is the delayed-keepalive shape, not a user wiping their league.
 */
export function isSubsetRegression(incoming: Iterable<number>, latest: Iterable<number>): boolean {
  const have = new Set(latest);
  if (have.size === 0) return false;
  let n = 0;
  for (const id of incoming) {
    n += 1;
    if (!have.has(id)) return false;
  }
  return n > 0 && n < have.size;
}

/**
 * Drop a middle session that is a strict subset of both neighbours when those
 * neighbours agree with each other. That is the stored shape of a delayed
 * first-sitting keepalive that arrived between two fuller sittings — the
 * admin's drop-then-restore. A real rebuild that lands on different ids is
 * kept.
 */
export function withoutDropRestorePhantoms<T>(
  items: readonly T[],
  idsOf: (item: T) => readonly number[],
): T[] {
  if (items.length < 3) return items.slice();
  return items.filter((item, i) => {
    if (i === 0 || i === items.length - 1) return true;
    const prev = idsOf(items[i - 1]);
    const next = idsOf(items[i + 1]);
    const cur = idsOf(item);
    if (!isSubsetRegression(cur, prev) || !isSubsetRegression(cur, next)) return true;
    const prevSet = new Set(prev);
    const nextSet = new Set(next);
    let overlap = 0;
    for (const id of prevSet) if (nextSet.has(id)) overlap += 1;
    const union = prevSet.size + nextSet.size - overlap;
    const jaccard = union === 0 ? 1 : overlap / union;
    return jaccard < 0.8;
  });
}
