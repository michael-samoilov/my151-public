import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis, parseRecord, CLIENTS_KEY, type ClientRecord } from './_shared.js';

// Public, anonymous aggregate stats derived from the client records: how many
// people completed a dex and which Pokemon they picked. No per-user data.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const all = (await redis.hgetall(CLIENTS_KEY)) as Record<string, unknown> | null;
    const records: ClientRecord[] = Object.values(all ?? {})
      .map(parseRecord)
      .filter((r): r is ClientRecord => r !== null);

    const picks: Record<string, number> = {};
    let total = 0;
    for (const r of records) {
      if (!r.completed || !r.completedIds) continue;
      total += 1;
      for (const id of r.completedIds) picks[id] = (picks[id] ?? 0) + 1;
    }

    // Cache for 60s at CDN, 30s stale-while-revalidate.
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json({ completion: { picks, total } });
  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
