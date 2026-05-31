import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis, requireAdmin, isMilestone } from './_shared';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!(await requireAdmin(req, res))) return;

  // Only the engagement milestone counters may be reset. Completion / export
  // hold real pokedex data and are deliberately NOT resettable here, so an
  // accidental (or malicious) call can never wipe them.
  const { source } = (req.body ?? {}) as { source?: unknown };
  if (typeof source !== 'string' || !isMilestone(source)) {
    return res.status(400).json({ error: 'source must be "interacted" or "engaged"' });
  }

  try {
    // Remove the all-time counter, the by-country tally, and the snapshot list.
    const removed = await redis.del(
      `total:${source}`,
      `countries:${source}`,
      `submissions:${source}`,
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, source, keysRemoved: removed });
  } catch (err) {
    console.error('Reset error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
