import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis, requireAdmin, isSource, isPokedexSource } from './_shared.js';

// Atomically remove one entry AND reconcile every aggregate in a single script,
// so there is no window where the entry is gone but counters are stale. Redis
// Lua has no JSON parser, so the entry's country/ids are passed in by the admin
// client (which already holds the loaded entry); every decrement is floored at
// 0 so a stale/mismatched value can never drive a counter negative.
// KEYS[1] submissions:<source>  KEYS[2] total:<source>
// KEYS[3] countries:<source>    KEYS[4] picks:<source>
// ARGV[1] needle (unique entry substring)   ARGV[2] country ('' to skip)
// ARGV[3..] pokemon ids (pokedex only; empty to skip picks)
// Returns 1 if an entry was removed, 0 if no match was found.
const DELETE_LUA = `
local items = redis.call('LRANGE', KEYS[1], 0, -1)
for i, v in ipairs(items) do
  if string.find(v, ARGV[1], 1, true) then
    redis.call('LSET', KEYS[1], i - 1, '__DELETED__')
    redis.call('LREM', KEYS[1], 1, '__DELETED__')
    local t = tonumber(redis.call('GET', KEYS[2]) or '0')
    if t > 0 then redis.call('DECR', KEYS[2]) end
    if ARGV[2] ~= '' then
      local c = tonumber(redis.call('HGET', KEYS[3], ARGV[2]) or '0')
      if c > 0 then redis.call('HINCRBY', KEYS[3], ARGV[2], -1) end
    end
    for j = 3, #ARGV do
      local p = tonumber(redis.call('HGET', KEYS[4], ARGV[j]) or '0')
      if p > 0 then redis.call('HINCRBY', KEYS[4], ARGV[j], -1) end
    end
    return 1
  end
end
return 0
`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!(await requireAdmin(req, res))) return;

  const { source, id, ts, country, ids } = (req.body ?? {}) as {
    source?: unknown;
    id?: unknown;
    ts?: unknown;
    country?: unknown;
    ids?: unknown;
  };
  if (typeof source !== 'string' || !isSource(source)) {
    return res.status(400).json({ error: 'invalid source' });
  }

  // Prefer the unique per-entry id; fall back to ts for legacy entries that
  // predate it. `string.find(..., true)` treats the needle as a plain string,
  // so no characters need escaping. The id needle includes the closing quote,
  // so a shorter id can't prefix-match a longer one.
  let needle: string;
  if (typeof id === 'string' && id) {
    needle = `"id":"${id}"`;
  } else if (typeof ts === 'number' && Number.isInteger(ts) && ts > 0) {
    needle = `"ts":${ts},`;
  } else {
    return res.status(400).json({ error: 'id or ts required' });
  }

  // country/ids come from the loaded entry the admin is deleting; used only to
  // floor-decrement the matching aggregates. Validate ids defensively.
  const countryArg = typeof country === 'string' && /^[A-Z]{2}$/.test(country) ? country : '';
  const idArgs =
    isPokedexSource(source) && Array.isArray(ids)
      ? ids.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0).map(String)
      : [];

  try {
    const removed = await redis.eval(
      DELETE_LUA,
      [`submissions:${source}`, `total:${source}`, `countries:${source}`, `picks:${source}`],
      [needle, countryArg, ...idArgs],
    );
    if (removed === 0) {
      return res.status(404).json({ error: 'Entry not found (already removed?)' });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, source });
  } catch (err) {
    console.error('Delete-entry error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
