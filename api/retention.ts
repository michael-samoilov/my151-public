import type { VercelRequest, VercelResponse } from '@vercel/node';
import { bearerMatches, isReadOnlyDeployment } from './_shared.js';
import { runRetention } from './_retention.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return res.status(503).json({ error: 'Cleanup not configured' });
  if (!bearerMatches(req, secret)) return res.status(401).json({ error: 'Unauthorized' });
  res.setHeader('Cache-Control', 'no-store');
  if (isReadOnlyDeployment(req)) return res.status(200).json({ ok: true, skipped: 'read-only deployment' });
  try {
    const run = await runRetention(Date.now());
    return res.status(200).json(run ? { ok: true, ...run } : { ok: true, skipped: 'another run holds the lock' });
  } catch (err) {
    console.error('Retention error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
