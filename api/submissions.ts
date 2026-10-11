import {FAVORITE_CLIENTS_KEY} from './_favoriteRecord.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis, requireAdmin, firstQueryValue, CLIENTS_KEY } from './_shared.js';
import { EXPORT_SURVEY_SKIPS_KEY } from './_events.js';
import { LEAGUE_CLIENTS_KEY } from './_leagueRecord.js';
import { ARCHIVED_KEY } from './_archive.js';
import { buildBrowser, buildDashboard } from './_dashboard.js';
import { funnelDayKeys, isDashboardRange } from './_range.js';
import { readMinuteActivityBudget } from './_activityHistoryStore.js';

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

const SECRET_FIELD = /password|token|secret|email|endpoint/i;

/** Drops any field whose name looks like a credential or address, at any depth. */
function withoutSecrets(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(withoutSecrets);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).filter(([k]) => !SECRET_FIELD.test(k)).map(([k, x]) => [k, withoutSecrets(x)]),
    );
  }
  return v;
}

/**
 * Upstash's own usage stats for this database (Developer API, Get Database
 * Stats), read with a read-only Developer API key that lives only in Vercel.
 * Costs no Redis command.
 */
export async function upstashUsage(env: NodeJS.ProcessEnv = process.env, get: typeof fetch = fetch) {
  const email = env.UPSTASH_MGMT_EMAIL?.trim();
  const key = env.UPSTASH_MGMT_API_KEY?.trim();
  const id = env.UPSTASH_DB_ID?.trim();
  if (!email || !key || !id) return { status: 'not_configured' as const };
  try {
    const r = await get(`https://api.upstash.com/v2/redis/stats/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${email}:${key}`).toString('base64')}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { status: 'error' as const, http: r.status };
    return { status: 'ready' as const, stats: withoutSecrets(await r.json()) };
  } catch {
    return { status: 'error' as const, http: 0 };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!(await requireAdmin(req, res))) return;
    // Private data — never cache.
    res.setHeader('Cache-Control', 'no-store');

    if (firstQueryValue(req.query.usage as string | string[] | undefined) === '1') {
      if (firstQueryValue(req.query.activity as string | string[] | undefined) === '1') {
        const [usage, activity] = await Promise.all([
          upstashUsage(), readMinuteActivityBudget(Date.now()).catch(() => ({status: 'error' as const})),
        ]);
        return res.status(200).json({...usage, activity});
      }
      return res.status(200).json(await upstashUsage());
    }

    // One browser's full records, for its detail page: one read per store
    // plus its export-survey skips, 4 commands in all.
    const cid = firstQueryValue(req.query.cid as string | string[] | undefined);
    if (cid) {
      if (cid.length > 64) return res.status(400).json({ error: 'Invalid cid' });
      // submit.ts keys a second person on the same browser, in another
      // country, as `<cid>::<country>`, with the raw x-vercel-ip-country value.
      // The report's country names that record; it wins when it exists.
      const country = firstQueryValue(req.query.country as string | string[] | undefined).trim();
      if (country && !/^[A-Za-z0-9]{1,4}$/.test(country)) return res.status(400).json({ error: 'Invalid country' });
      const dexFields = country ? [`${cid}::${country}`, cid] : [cid];
      const [dexHits, league, favorite, exportSurveySkips] = await Promise.all([
        redis.hmget<Record<string, unknown>>(CLIENTS_KEY, ...dexFields),
        redis.hget(LEAGUE_CLIENTS_KEY, cid),
        redis.hget(FAVORITE_CLIENTS_KEY, cid),
        redis.hget(EXPORT_SURVEY_SKIPS_KEY, cid),
      ]);
      const dex = dexFields.map((f) => dexHits?.[f]).find((v) => v != null) ?? null;
      return res.status(200).json(buildBrowser(cid, { dex, league, favorite, exportSurveySkips }));
    }

    const range = firstQueryValue(req.query.range as string | string[] | undefined) || 'all';
    if (!isDashboardRange(range)) return res.status(400).json({ error: 'Invalid range' });

    const now = Date.now();
    const dayKeys = funnelDayKeys(range, now);
    const [clients, archived, funnel, funnelDays, leagueClients, favoriteClients] = await Promise.all([
      redis.hgetall(CLIENTS_KEY) as Promise<Record<string, unknown> | null>,
      redis.smembers(ARCHIVED_KEY),
      redis.hgetall('funnel') as Promise<Record<string, unknown> | null>,
      dayKeys ? redis.eval(SUM_HASHES, dayKeys, []) : null,
      redis.hgetall(LEAGUE_CLIENTS_KEY) as Promise<Record<string, unknown> | null>,
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
      },
      { range },
      now,
    );

    return res.status(200).json(body);
  } catch (err) {
    console.error('Submissions error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
