import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis, requireAdmin, firstQueryValue, CLIENTS_KEY } from './_shared.js';
import { EXPORT_SURVEY_SKIPS_KEY } from './_events.js';
import { LEAGUE_CLIENTS_KEY } from './_leagueRecord.js';
import { ARCHIVED_KEY } from './_archive.js';
import { buildDashboard } from './_dashboard.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!(await requireAdmin(req, res))) return;

    const rawLimit = parseInt(firstQueryValue(req.query.limit as string | string[] | undefined), 10);
    const rawOffset = parseInt(firstQueryValue(req.query.offset as string | string[] | undefined), 10);
    const limit = Math.min(Math.max(Number.isNaN(rawLimit) ? 50 : rawLimit, 1), 500);
    const offset = Math.max(Number.isNaN(rawOffset) ? 0 : rawOffset, 0);

    const [clients, archived, funnel, leagueClients, exportSurveySkips] = await Promise.all([
      redis.hgetall(CLIENTS_KEY) as Promise<Record<string, unknown> | null>,
      redis.smembers(ARCHIVED_KEY),
      redis.hgetall('funnel') as Promise<Record<string, unknown> | null>,
      redis.hgetall(LEAGUE_CLIENTS_KEY) as Promise<Record<string, unknown> | null>,
      redis.hgetall(EXPORT_SURVEY_SKIPS_KEY) as Promise<Record<string, unknown> | null>,
    ]);
    const body = buildDashboard(
      { clients, archived, funnel, leagueClients, exportSurveySkips },
      { offset, limit },
      Date.now(),
    );

    // Private data — never cache.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(body);
  } catch (err) {
    console.error('Submissions error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
