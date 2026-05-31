import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Only the engagement milestone counters may be reset from here. Completion /
// export hold real pokedex data and are deliberately NOT resettable via this
// endpoint, so an accidental (or malicious) call can never wipe them.
const RESETTABLE_SOURCES = ['interacted', 'engaged'] as const;
type ResettableSource = typeof RESETTABLE_SOURCES[number];

function isResettable(s: string): s is ResettableSource {
  return (RESETTABLE_SOURCES as readonly string[]).includes(s);
}

/** Constant-time string compare to avoid leaking the token via timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    return res.status(503).json({ error: 'Admin access not configured' });
  }

  const authHeader = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization ?? '';
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
  if (!provided || !safeEqual(provided, adminToken)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { source } = (req.body ?? {}) as { source?: unknown };
  if (typeof source !== 'string' || !isResettable(source)) {
    return res.status(400).json({ error: 'source must be "interacted" or "engaged"' });
  }

  try {
    // Remove the all-time counter, the by-country tally, and the snapshot list.
    const removed = await redis.del(
      `total:${source}`,
      `countries:${source}`,
      `submissions:${source}`,
    );
    return res.status(200).json({ ok: true, source, keysRemoved: removed });
  } catch (err) {
    console.error('Reset error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
