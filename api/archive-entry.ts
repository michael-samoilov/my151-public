import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis, isReadOnlyDeployment, requireAdmin } from './_shared.js';
import { ARCHIVED_KEY, bareCid } from './_archive.js';

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
    if (archived) await redis.sadd(ARCHIVED_KEY, key);
    else await redis.srem(ARCHIVED_KEY, key);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, cid: key, archived });
  } catch (err) {
    console.error('Archive-entry error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
