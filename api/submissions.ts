import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  redis,
  requireAdmin,
  firstQueryValue,
  parseRecord,
  CLIENTS_KEY,
  type ClientRecord,
} from './_shared.js';

// Max-depth histogram buckets (distinct evolution lines reached). Edges are
// inclusive-lower; the last is open-ended. Chosen to show the churn curve.
const DEPTH_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '1–2', min: 1, max: 2 },
  { label: '3–5', min: 3, max: 5 },
  { label: '6–10', min: 6, max: 10 },
  { label: '11–20', min: 11, max: 20 },
  { label: '21–40', min: 21, max: 40 },
  { label: '41–79', min: 41, max: 79 },
  { label: '80+', min: 80, max: Infinity },
];

const DAY = 86_400_000;

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
    const depthHistogram = DEPTH_BUCKETS.map((b) => ({ label: b.label, count: 0 }));
    const countries: Record<string, number> = {};
    const devices: Record<string, number> = {};
    const osCounts: Record<string, number> = {};
    const hours = new Array<number>(24).fill(0);
    const picksFirst: Record<string, number> = {};
    const picksFinal: Record<string, number> = {};

    let completed = 0;
    let exported = 0;
    let returning = 0; // distinct days active OR first/last > 1 day apart
    let activeLast7 = 0;

    for (const r of records) {
      // Depth histogram.
      const bi = DEPTH_BUCKETS.findIndex((b) => r.maxDepth >= b.min && r.maxDepth <= b.max);
      if (bi >= 0) depthHistogram[bi].count += 1;

      if (r.country) countries[r.country] = (countries[r.country] ?? 0) + 1;
      if (r.device) devices[r.device] = (devices[r.device] ?? 0) + 1;
      if (r.os) osCounts[r.os] = (osCounts[r.os] ?? 0) + 1;
      if (typeof r.localHour === 'number') hours[r.localHour % 24] += 1;

      for (const id of r.firstIds ?? []) picksFirst[id] = (picksFirst[id] ?? 0) + 1;
      for (const id of r.latestIds ?? []) picksFinal[id] = (picksFinal[id] ?? 0) + 1;

      if (r.completed) completed += 1;
      if (r.exported) exported += 1;
      // "Returning" = came back at least ~1 day after first seen.
      if (r.lastTs - r.firstTs >= DAY) returning += 1;
      if (now - r.lastTs <= 7 * DAY) activeLast7 += 1;
    }

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
      countries,
      devices,
      os: osCounts,
      hours,
      popularFirst: topN(picksFirst, 30),
      popularFinal: topN(picksFinal, 30),
      records: page,
    });
  } catch (err) {
    console.error('Submissions error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
