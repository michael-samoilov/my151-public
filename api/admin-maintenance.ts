import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis, isReadOnlyDeployment, requireAdmin } from './_shared.js';
import { DAY_MS, dayStart } from './_aggregate.js';
import { FUNNEL_DAY_TTL_DAYS } from './_range.js';
import { ARCHIVED_KEY } from './_archive.js';
import { rebuildFunnelExclusions } from './_funnelExclusions.js';
import { recountDexPickFreq } from './_recountDexPickFreq.js';

const EXTEND_EXPIRY = `
local now = tonumber(ARGV[#KEYS + 1])
local n = 0
for i, key in ipairs(KEYS) do
  local at = tonumber(ARGV[i])
  local ttl = redis.call('TTL', key)
  if ttl == -1 or (ttl >= 0 and now + ttl < at) then
    redis.call('EXPIREAT', key, at)
    n = n + 1
  end
end
return n
`;

export function funnelRetentionPlan(now: number): { keys: string[]; expireAt: string[] } {
  const today = dayStart(now);
  const keys: string[] = [];
  const expireAt: string[] = [];
  for (let i = FUNNEL_DAY_TTL_DAYS; i >= 0; i--) {
    const day = today - i * DAY_MS;
    keys.push(`funnel:${new Date(day).toISOString().slice(0, 10)}`);
    expireAt.push(String(Math.floor((day + (FUNNEL_DAY_TTL_DAYS + 1) * DAY_MS) / 1000)));
  }
  return { keys, expireAt };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (isReadOnlyDeployment(req)) return res.status(403).json({ error: 'Only the live site saves data' });
  if (!(await requireAdmin(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');

  const { task } = (req.body ?? {}) as { task?: unknown };
  try {
    if (task === 'funnel-retention') {
      const now = Date.now();
      const { keys, expireAt } = funnelRetentionPlan(now);
      const args = [...expireAt, String(Math.floor(now / 1000))];
      const extended = Number(await redis.eval(EXTEND_EXPIRY, keys, args));
      return res.status(200).json({ ok: true, task, checked: keys.length, extended });
    }
    if (task === 'recount-dex-pick-freq') {
      const apply = (req.body as { apply?: unknown }).apply === true;
      return res.status(200).json({ ok: true, task, apply, ...(await recountDexPickFreq(apply)) });
    }
    if (task === 'funnel-exclusions') {
      const archived = ((await redis.smembers(ARCHIVED_KEY)) ?? []).map(String);
      const excluded = await rebuildFunnelExclusions(archived);
      return res.status(200).json({ ok: true, task, browsers: archived.length, excluded });
    }
    return res.status(400).json({ error: 'unknown task' });
  } catch (err) {
    console.error('Admin-maintenance error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
