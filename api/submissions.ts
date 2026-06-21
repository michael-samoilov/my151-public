import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  redis,
  requireAdmin,
  firstQueryValue,
  parseRecord,
  CLIENTS_KEY,
  type ClientRecord,
} from './_shared.js';

const DAY = 86_400_000;
const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Local day-of-week (0=Sun) and hour (0–23) for a record, derived from its
 *  timezone + last-activity timestamp. Prefers stored localDow/localHour when
 *  present, but falls back to deriving from lastTs+tz — which back-populates
 *  every legacy record that predates those fields. */
function localSlot(r: ClientRecord): { dow: number; hour: number } | null {
  if (typeof r.localDow === 'number' && typeof r.localHour === 'number') {
    return { dow: r.localDow % 7, hour: r.localHour % 24 };
  }
  if (!r.lastTs) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: r.tz || 'UTC',
      weekday: 'short',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(r.lastTs);
    const wd = parts.find((p) => p.type === 'weekday')?.value ?? '';
    const hrStr = parts.find((p) => p.type === 'hour')?.value ?? '';
    const dow = DOW_NAMES.indexOf(wd);
    const hour = parseInt(hrStr, 10) % 24;
    if (dow < 0 || !Number.isFinite(hour)) return null;
    return { dow, hour };
  } catch {
    return null;
  }
}

// Per-minute time-before-churn bars up to this cap; everything longer (incl.
// returning users who came back another day) falls in the final overflow bar.
function topN(counts: Record<string, number>, n: number): [string, number][] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

/** Value at quantile q (0..1) of an ascending-sorted array. */
function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const i = Math.min(sortedAsc.length - 1, Math.floor(q * sortedAsc.length));
  return sortedAsc[i];
}

/** Fraction of values >= t (the survival function), via binary search. */
function survivalAt(sortedAsc: number[], t: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return (n - lo) / n;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!(await requireAdmin(req, res))) return;

    const rawLimit = parseInt(firstQueryValue(req.query.limit as string | string[] | undefined), 10);
    const rawOffset = parseInt(firstQueryValue(req.query.offset as string | string[] | undefined), 10);
    const limit = Math.min(Math.max(Number.isNaN(rawLimit) ? 50 : rawLimit, 1), 500);
    const offset = Math.max(Number.isNaN(rawOffset) ? 0 : rawOffset, 0);

    const all = (await redis.hgetall(CLIENTS_KEY)) as Record<string, unknown> | null;
    const records: ClientRecord[] = Object.values(all ?? {})
      .map(parseRecord)
      .filter((r): r is ClientRecord => r !== null);

    // Newest-active first.
    records.sort((a, b) => b.lastTs - a.lastTs);

    const now = Date.now();
    const countries: Record<string, number> = {};
    const devices: Record<string, number> = {};
    const osCounts: Record<string, number> = {};
    const hours = new Array<number>(24).fill(0);
    // 7 (day-of-week, 0=Sun) × 24 (hour) heatmap of users' local build times.
    const heatmap: number[][] = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
    // Raw per-user values; we build survival (drop-off) curves from these.
    const sittingSecs: number[] = []; // longest-session duration in seconds
    const depths: number[] = []; // max evolution lines reached
    const picksFinal: Record<string, number> = {}; // one vote per user's final dex
    const droppedCounts: Record<string, number> = {}; // ever placed but not in final dex

    let completed = 0;
    let exported = 0;
    let returning = 0;
    let activeLast7 = 0;

    for (const r of records) {
      depths.push(r.maxDepth);

      // Longest continuous sitting. Prefer the sessionized value; fall back to
      // the first→last span for legacy records that predate sessionization.
      const sittingMs = r.maxSessionMs ?? Math.max(0, r.lastTs - r.firstTs);
      sittingSecs.push(Math.round(sittingMs / 1000));

      if (r.country) countries[r.country] = (countries[r.country] ?? 0) + 1;
      if (r.device) devices[r.device] = (devices[r.device] ?? 0) + 1;
      if (r.os) osCounts[r.os] = (osCounts[r.os] ?? 0) + 1;
      // Derive local day+hour from tz+lastTs (back-populates legacy records).
      const slot = localSlot(r);
      if (slot) {
        hours[slot.hour] += 1;
        heatmap[slot.dow][slot.hour] += 1;
      }

      // Popularity across every user's final/current dex (one vote each), so it
      // reflects everyone — not just the few who finish a full 151.
      for (const id of r.latestIds ?? []) picksFinal[id] = (picksFinal[id] ?? 0) + 1;
      if (r.completed) completed += 1;

      // Adjustment signal: placed at some point but not kept in the final dex.
      const kept = new Set(r.latestIds ?? []);
      for (const id of r.everIds ?? []) {
        if (!kept.has(id)) droppedCounts[id] = (droppedCounts[id] ?? 0) + 1;
      }
      if (r.exported) exported += 1;
      if (r.lastTs - r.firstTs >= DAY) returning += 1;
      if (now - r.lastTs <= 7 * DAY) activeLast7 += 1;
    }

    // --- Survival (drop-off) curves -------------------------------------
    // S(t) = fraction of sessions still active at t. The steepest part of the
    // curve is where people churn — that's where to intervene. We sample the
    // x-axis up to the 95th percentile (so the long tail doesn't flatten the
    // interesting region) at a fixed number of points.
    sittingSecs.sort((a, b) => a - b);
    depths.sort((a, b) => a - b);

    // Time survival: fine-grained where it matters — every 30s for the first
    // 10 min, then every 60s out to the 95th percentile (min 60s of range).
    const tMax = Math.max(60, quantile(sittingSecs, 0.95));
    const timeTicks: number[] = [];
    for (let t = 0; t <= Math.min(tMax, 600); t += 30) timeTicks.push(t);
    for (let t = 660; t <= tMax; t += 60) timeTicks.push(t);
    if (timeTicks[timeTicks.length - 1] !== tMax) timeTicks.push(tMax);
    const timeSurvival = timeTicks.map((t) => ({ t, s: survivalAt(sittingSecs, t) }));
    // Median / p75 / p90 churn points (the durations by which that % have left).
    const timeStats = {
      p50: quantile(sittingSecs, 0.5),
      p75: quantile(sittingSecs, 0.75),
      p90: quantile(sittingSecs, 0.9),
    };

    // Depth survival: x in evolution lines, 0..maxObserved.
    const dMax = Math.max(1, depths[depths.length - 1] ?? 1);
    const depthSurvival: { t: number; s: number }[] = [];
    for (let d = 0; d <= dMax; d++) {
      depthSurvival.push({ t: d, s: survivalAt(depths, d) });
    }
    const depthStats = {
      p50: quantile(depths, 0.5),
      p75: quantile(depths, 0.75),
      p90: quantile(depths, 0.9),
    };

    const totalUsers = records.length;
    const page = records.slice(offset, offset + limit);

    // Private data — never cache.
    res.setHeader('Cache-Control', 'no-store');

    return res.status(200).json({
      totalUsers,
      offset,
      limit,
      funnel: { users: totalUsers, completed, exported },
      retention: { returning, activeLast7, newUsers: totalUsers - returning },
      timeSurvival,
      timeStats,
      depthSurvival,
      depthStats,
      countries,
      devices,
      os: osCounts,
      hours,
      heatmap,
      // Full ranked lists; the admin UI previews the top N and expands the rest.
      popularFinal: topN(picksFinal, 151),
      mostDropped: topN(droppedCounts, 151),
      records: page,
    });
  } catch (err) {
    console.error('Submissions error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
