import {FAVORITE_CLIENTS_KEY} from './_favoriteRecord.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis, requireAdmin, firstQueryValue, CLIENTS_KEY } from './_shared.js';
import { EXPORT_SURVEY_SKIPS_KEY } from './_events.js';
import { LEAGUE_CLIENTS_KEY } from './_leagueRecord.js';
import { ARCHIVED_KEY } from './_archive.js';
import { buildDashboard } from './_dashboard.js';
import { funnelDayKeys, isDashboardRange } from './_range.js';

// Sums every field across the window's day counters inside Redis, so the
// window costs one billed command however many days it spans.
const SUM_HASHES = `
local sums = {}
for _, key in ipairs(KEYS) do
  local h = redis.call('HGETALL', key)
  for i = 1, #h, 2 do
    sums[h[i]] = (sums[h[i]] or 0) + tonumber(h[i + 1])
  end
end
local out = {}
for field, n in pairs(sums) do
  out[#out + 1] = field
  out[#out + 1] = n
end
return out
`;

/** The script's flat [field, n, field, n, …] reply as a hash. */
function pairsToHash(flat: unknown): Record<string, unknown> {
  const list = Array.isArray(flat) ? flat : [];
  const out: Record<string, unknown> = {};
  for (let i = 0; i + 1 < list.length; i += 2) out[String(list[i])] = list[i + 1];
  return out;
}

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
    const range = firstQueryValue(req.query.range as string | string[] | undefined) || 'all';
    if (!isDashboardRange(range)) return res.status(400).json({ error: 'Invalid range' });

    const now = Date.now();
    const dayKeys = funnelDayKeys(range, now);
    const [clients, archived, funnel, funnelDays, leagueClients, exportSurveySkips, favoriteClients] = await Promise.all([
      redis.hgetall(CLIENTS_KEY) as Promise<Record<string, unknown> | null>,
      redis.smembers(ARCHIVED_KEY),
      redis.hgetall('funnel') as Promise<Record<string, unknown> | null>,
      dayKeys ? redis.eval(SUM_HASHES, dayKeys, []) : null,
      redis.hgetall(LEAGUE_CLIENTS_KEY) as Promise<Record<string, unknown> | null>,
      redis.hgetall(EXPORT_SURVEY_SKIPS_KEY) as Promise<Record<string, unknown> | null>,
      redis.hgetall(FAVORITE_CLIENTS_KEY) as Promise<Record<string, unknown> | null>,
    ]);
    const body = buildDashboard(
      {
        clients,
        archived,
        funnel,
        funnelWindow: dayKeys ? pairsToHash(funnelDays) : null,
        leagueClients,
        favoriteClients,
        exportSurveySkips,
      },
      { offset, limit, range },
      now,
    );

    // Private data — never cache.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(body);
  } catch (err) {
    console.error('Submissions error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
