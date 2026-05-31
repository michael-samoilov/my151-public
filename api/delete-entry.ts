import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis, requireAdmin, isSource, isPokedexSource } from './_shared';

// Find the (newest) list entry whose JSON contains the needle, tombstone it,
// LREM it, and RETURN the removed raw entry — all in one atomic script so a
// concurrent LPUSH can't shift indices underneath us. Returns '' if not found.
// KEYS[1] = submissions:<source>   ARGV[1] = needle (unique substring)
const DELETE_LUA = `
local items = redis.call('LRANGE', KEYS[1], 0, -1)
for i, v in ipairs(items) do
  if string.find(v, ARGV[1], 1, true) then
    redis.call('LSET', KEYS[1], i - 1, '__DELETED__')
    redis.call('LREM', KEYS[1], 1, '__DELETED__')
    return v
  end
end
return ''
`;

// Undo the aggregate counters for one removed entry. Runs after the entry is
// gone from the list, so a retry can't double-decrement (it won't re-find it).
// KEYS[1] = total:<source>   KEYS[2] = countries:<source>   KEYS[3] = picks:<source>
// ARGV[1] = country ('' to skip)   ARGV[2] = '1' to decrement picks
// ARGV[3..] = pokemon ids (only when decrementing picks)
const DECREMENT_LUA = `
local t = tonumber(redis.call('GET', KEYS[1]) or '0')
if t > 0 then redis.call('DECR', KEYS[1]) end
if ARGV[1] ~= '' then redis.call('HINCRBY', KEYS[2], ARGV[1], -1) end
if ARGV[2] == '1' then
  for i = 3, #ARGV do redis.call('HINCRBY', KEYS[3], ARGV[i], -1) end
end
return 1
`;

interface StoredEntry {
  id?: string;
  ids?: number[];
  country?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!(await requireAdmin(req, res))) return;

  const { source, id, ts } = (req.body ?? {}) as { source?: unknown; id?: unknown; ts?: unknown };
  if (typeof source !== 'string' || !isSource(source)) {
    return res.status(400).json({ error: 'invalid source' });
  }

  // Prefer the unique per-entry id; fall back to ts for legacy entries that
  // predate it. `string.find(..., true)` treats the needle as a plain string,
  // so no characters need escaping.
  let needle: string;
  if (typeof id === 'string' && id) {
    needle = `"id":"${id}"`;
  } else if (typeof ts === 'number' && Number.isInteger(ts) && ts > 0) {
    needle = `"ts":${ts},`;
  } else {
    return res.status(400).json({ error: 'id or ts required' });
  }

  try {
    const removed = (await redis.eval(DELETE_LUA, [`submissions:${source}`], [needle])) as
      | string
      | StoredEntry
      | null;
    if (!removed) {
      return res.status(404).json({ error: 'Entry not found (already removed?)' });
    }

    // @upstash/redis may hand back the JSON already parsed.
    let entry: StoredEntry = {};
    if (typeof removed === 'string') {
      try {
        entry = JSON.parse(removed) as StoredEntry;
      } catch {
        entry = {};
      }
    } else {
      entry = removed;
    }

    // Keep total / countries / picks consistent with the removed entry.
    const decrementPicks = isPokedexSource(source) && Array.isArray(entry.ids);
    await redis.eval(
      DECREMENT_LUA,
      [`total:${source}`, `countries:${source}`, `picks:${source}`],
      [
        entry.country ?? '',
        decrementPicks ? '1' : '0',
        ...(decrementPicks ? entry.ids!.map(String) : []),
      ],
    );

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, source });
  } catch (err) {
    console.error('Delete-entry error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
