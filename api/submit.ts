import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const MAX_POKEMON_ID = 1025;
const VALID_SOURCES = ['completion', 'export'] as const;
type Source = typeof VALID_SOURCES[number];

// Rate limiters: per-IP, analytics disabled to avoid doubling Upstash command count.
const completionLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(2, '1 d'),
  analytics: false,
  prefix: 'rl:completion',
});
const exportLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(20, '1 d'),
  analytics: false,
  prefix: 'rl:export',
});
const burstLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(500, '10 m'),
  analytics: false,
  prefix: 'rl:burst',
});

// Single Lua script: bulk HINCRBY + 1 INCR counts as 1 Upstash command regardless of ID count.
// KEYS[1] = picks:<source>   KEYS[2] = total:<source>
// ARGV    = list of pokemon IDs as strings
const SUBMIT_LUA = `
for i = 1, #ARGV do
  redis.call('HINCRBY', KEYS[1], ARGV[i], 1)
end
redis.call('INCR', KEYS[2])
return 1
`;

function getClientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  if (raw) return raw.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { ids, source } = req.body as { ids: unknown; source: unknown };

    // Validate source
    if (!source || !VALID_SOURCES.includes(source as Source)) {
      return res.status(400).json({ error: 'source must be "completion" or "export"' });
    }

    // Validate IDs array
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 151) {
      return res.status(400).json({ error: 'Expected 1-151 Pokemon IDs' });
    }

    // Completion source requires exactly 151
    if (source === 'completion' && ids.length !== 151) {
      return res.status(400).json({ error: 'Completion requires exactly 151 Pokemon IDs' });
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

    // Rate limit per IP before touching state.
    const ip = getClientIp(req);
    const burst = await burstLimiter.limit(ip);
    if (!burst.success) {
      res.setHeader('Retry-After', Math.ceil((burst.reset - Date.now()) / 1000));
      return res.status(429).json({ error: 'Too many requests' });
    }
    const perSource = source === 'completion'
      ? await completionLimiter.limit(ip)
      : await exportLimiter.limit(ip);
    if (!perSource.success) {
      res.setHeader('Retry-After', Math.ceil((perSource.reset - Date.now()) / 1000));
      return res.status(429).json({ error: 'Too many requests' });
    }

    // Single EVAL command — bulk increments in one round-trip.
    await redis.eval(
      SUBMIT_LUA,
      [`picks:${source}`, `total:${source}`],
      ids.map(String),
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Submit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
