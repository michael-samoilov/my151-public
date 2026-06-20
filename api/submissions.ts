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
const MINUTE = 60_000;
// Per-minute time-before-churn bars up to this cap; everything longer (incl.
// returning users who came back another day) falls in the final overflow bar.
const MAX_SPAN_MIN = 180;

function topN(counts: Record<string, number>, n: number): [string, number][] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
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
    // One bucket per exact value (no arbitrary ranges).
    const depthCounts: Record<number, number> = {}; // maxDepth (evo lines) -> users
    const spanCounts: Record<number, number> = {}; // whole minutes before churn -> users
    let spanOverflow = 0; // > MAX_SPAN_MIN minutes (incl. returning users)
    const picksFinal: Record<string, number> = {}; // one vote per user's final dex
    const droppedCounts: Record<string, number> = {}; // ever placed but not in final dex

    let completed = 0;
    let exported = 0;
    let returning = 0;
    let activeLast7 = 0;

    for (const r of records) {
      depthCounts[r.maxDepth] = (depthCounts[r.maxDepth] ?? 0) + 1;

      // Longest continuous sitting. Prefer the sessionized value; fall back to
      // the first→last span for legacy records that predate sessionization.
      const sittingMs = r.maxSessionMs ?? Math.max(0, r.lastTs - r.firstTs);
      const spanMin = Math.floor(sittingMs / MINUTE);
      if (spanMin > MAX_SPAN_MIN) spanOverflow += 1;
      else spanCounts[spanMin] = (spanCounts[spanMin] ?? 0) + 1;

      if (r.country) countries[r.country] = (countries[r.country] ?? 0) + 1;
      if (r.device) devices[r.device] = (devices[r.device] ?? 0) + 1;
      if (r.os) osCounts[r.os] = (osCounts[r.os] ?? 0) + 1;
      if (typeof r.localHour === 'number') {
        const h = r.localHour % 24;
        hours[h] += 1;
        // Only records with a captured day-of-week contribute to the heatmap.
        if (typeof r.localDow === 'number') heatmap[r.localDow % 7][h] += 1;
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

    // Dense per-line depth bars from 0..maxObserved (skip empty tail).
    const maxDepthSeen = Math.max(0, ...Object.keys(depthCounts).map(Number));
    const depthHistogram: { label: string; count: number }[] = [];
    for (let d = 0; d <= maxDepthSeen; d++) {
      depthHistogram.push({ label: String(d), count: depthCounts[d] ?? 0 });
    }

    // Dense per-minute time bars 0..MAX_SPAN_MIN, then an overflow bar.
    const timeHistogram: { label: string; count: number }[] = [];
    for (let m = 0; m <= MAX_SPAN_MIN; m++) {
      timeHistogram.push({ label: `${m}m`, count: spanCounts[m] ?? 0 });
    }
    timeHistogram.push({ label: '>3h', count: spanOverflow });

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
      depthHistogram,
      timeHistogram,
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
