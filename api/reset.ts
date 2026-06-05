import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis, requireAdmin, isSource, isPokedexSource } from './_shared.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!(await requireAdmin(req, res))) return;

  // Any source may be reset to zero. Each is gated behind a per-tab confirm in
  // the admin UI, so this is an explicit, deliberate wipe.
  const { source } = (req.body ?? {}) as { source?: unknown };
  if (typeof source !== 'string' || !isSource(source)) {
    return res.status(400).json({ error: 'invalid source' });
  }

  try {
    // Remove the all-time counter, by-country tally, and snapshot list — plus
    // the per-Pokemon picks histogram for pokedex sources.
    const keys = [`total:${source}`, `countries:${source}`, `submissions:${source}`];
    if (isPokedexSource(source)) keys.push(`picks:${source}`);
    const removed = await redis.del(...keys);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, source, keysRemoved: removed });
  } catch (err) {
    console.error('Reset error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
