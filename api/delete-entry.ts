import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Any source's individual entries may be removed here (unlike /api/reset, which
// wipes whole milestone sources and protects completion/export wholesale).
const ALL_SOURCES = ['completion', 'export', 'interacted', 'engaged'] as const;
type Source = typeof ALL_SOURCES[number];

function isSource(s: string): s is Source {
  return (ALL_SOURCES as readonly string[]).includes(s);
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

// Find the (newest) list entry whose JSON contains the given needle, replace it
// with a tombstone, and LREM it — all in one atomic script so a concurrent
// LPUSH can't shift indices underneath us. Decrement the all-time counter when
// an entry is actually removed. Returns 1 if removed, 0 if not found.
// KEYS[1] = submissions:<source>   KEYS[2] = total:<source>
// ARGV[1] = needle (a unique substring of the target entry's JSON)
const DELETE_LUA = `
local items = redis.call('LRANGE', KEYS[1], 0, -1)
for i, v in ipairs(items) do
  if string.find(v, ARGV[1], 1, true) then
    redis.call('LSET', KEYS[1], i - 1, '__DELETED__')
    redis.call('LREM', KEYS[1], 1, '__DELETED__')
    local t = tonumber(redis.call('GET', KEYS[2]) or '0')
    if t > 0 then redis.call('DECR', KEYS[2]) end
    return 1
  end
end
return 0
`;

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

  const { source, ts } = (req.body ?? {}) as { source?: unknown; ts?: unknown };
  if (typeof source !== 'string' || !isSource(source)) {
    return res.status(400).json({ error: 'invalid source' });
  }
  if (typeof ts !== 'number' || !Number.isInteger(ts) || ts <= 0) {
    return res.status(400).json({ error: 'ts (entry timestamp) required' });
  }

  try {
    // Each entry is JSON with a `"ts":<ms>,` field — a stable, near-unique
    // marker for a single submission within its source list.
    const needle = `"ts":${ts},`;
    const removed = await redis.eval(
      DELETE_LUA,
      [`submissions:${source}`, `total:${source}`],
      [needle],
    );
    if (removed === 0) {
      return res.status(404).json({ error: 'Entry not found (already removed?)' });
    }
    return res.status(200).json({ ok: true, source, ts });
  } catch (err) {
    console.error('Delete-entry error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
