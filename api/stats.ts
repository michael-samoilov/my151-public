import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const [completionPicks, completionTotal, exportPicks, exportTotal] = await Promise.all([
      redis.hgetall('picks:completion') as Promise<Record<string, number> | null>,
      redis.get('total:completion') as Promise<number | null>,
      redis.hgetall('picks:export') as Promise<Record<string, number> | null>,
      redis.get('total:export') as Promise<number | null>,
    ]);

    // Cache for 60s at CDN, 30s stale-while-revalidate
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

    return res.status(200).json({
      completion: {
        picks: completionPicks ?? {},
        total: completionTotal ?? 0,
      },
      export: {
        picks: exportPicks ?? {},
        total: exportTotal ?? 0,
      },
    });
  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
