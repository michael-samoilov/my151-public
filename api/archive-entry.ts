import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis, isReadOnlyDeployment, requireAdmin } from './_shared.js';
import { ARCHIVED_KEY, bareCid } from './_archive.js';
import { adjustFunnelExclusions } from './_funnelExclusions.js';

/** Mark a browser archived, or clear that mark. Idempotent. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (isReadOnlyDeployment(req)) return res.status(403).json({ error: 'Only the live site saves data' });
  if (!(await requireAdmin(req, res))) return;

  const { cid, archived } = (req.body ?? {}) as { cid?: unknown; archived?: unknown };
  if (typeof cid !== 'string' || !cid) {
    return res.status(400).json({ error: 'cid required' });
  }
  if (typeof archived !== 'boolean') {
    return res.status(400).json({ error: 'archived boolean required' });
  }

  try {
    const key = bareCid(cid);
    const changed = archived ? await redis.sadd(ARCHIVED_KEY, key) : await redis.srem(ARCHIVED_KEY, key);
    // Only a real change moves the funnel exclusions, so a repeated click is a no-op.
    // If the recount fails, the mark stands; the `funnel-exclusions` upkeep task repairs it.
    if (changed) await adjustFunnelExclusions(key, archived ? 1 : -1).catch((err) => console.error('Funnel exclusions error:', err));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, cid: key, archived });
  } catch (err) {
    console.error('Archive-entry error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
