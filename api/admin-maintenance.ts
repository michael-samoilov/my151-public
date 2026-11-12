import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis, isReadOnlyDeployment, requireAdmin } from './_shared.js';
import { ARCHIVED_KEY } from './_archive.js';
import { rebuildFunnelExclusions } from './_funnelExclusions.js';
import { recountDexPickFreq } from './_recountDexPickFreq.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (isReadOnlyDeployment(req)) return res.status(403).json({ error: 'Only the live site saves data' });
  if (!(await requireAdmin(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');

  const { task } = (req.body ?? {}) as { task?: unknown };
  try {
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
