import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis, requireAdmin, CLIENTS_KEY } from './_shared.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!(await requireAdmin(req, res))) return;

  // Wipe all analytics. Single hash, so one DEL clears everything; every
  // aggregate is derived from it, so nothing else needs touching.
  try {
    await redis.del(CLIENTS_KEY);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Reset error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
