import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis, requireAdmin, CLIENTS_KEY, VERSION_KEY } from './_shared.js';

// Remove one client's record. Aggregates are computed on read, so a single
// HDEL is all that's needed — nothing to reconcile.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!(await requireAdmin(req, res))) return;

  const { cid } = (req.body ?? {}) as { cid?: unknown };
  if (typeof cid !== 'string' || !cid) {
    return res.status(400).json({ error: 'cid required' });
  }

  try {
    const removed = await redis.hdel(CLIENTS_KEY, cid);
    // Clear the parallel version so a future record under this cid starts fresh.
    await redis.hdel(VERSION_KEY, cid);
    if (removed === 0) {
      return res.status(404).json({ error: 'Client not found (already removed?)' });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Delete-entry error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
