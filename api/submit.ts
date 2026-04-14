import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const MAX_POKEMON_ID = 1025;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { ids } = req.body as { ids: unknown };

    // Validate: must be array of exactly 151 numbers, all valid Pokemon IDs
    if (!Array.isArray(ids) || ids.length !== 151) {
      return res.status(400).json({ error: 'Expected exactly 151 Pokemon IDs' });
    }

    const seen = new Set<number>();
    for (const id of ids) {
      if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > MAX_POKEMON_ID) {
        return res.status(400).json({ error: `Invalid Pokemon ID: ${id}` });
      }
      if (seen.has(id)) {
        return res.status(400).json({ error: `Duplicate Pokemon ID: ${id}` });
      }
      seen.add(id);
    }

    // Pipeline: single HTTP request to Upstash, increments each Pokemon's counter
    const pipe = redis.pipeline();
    for (const id of ids) {
      pipe.hincrby('picks', String(id), 1);
    }
    pipe.incr('total_submissions');
    await pipe.exec();

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Submit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
