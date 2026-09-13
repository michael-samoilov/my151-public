import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Ratelimit } from '@upstash/ratelimit';
import { SUBMIT_CLIENT_DAILY_CAP } from './_limits.js';
import { parsePage } from './_events.js';
import { redis, getClientIp, getClient, getGeo, getLang, parseLocale, parseReferrerHost, MAX_CLIENTS } from './_shared.js';
import {
  LEAGUE_CLIENTS_KEY,
  LEAGUE_VERSION_KEY,
  isLeagueBeaconKind,
  isLeagueExportKind,
  mergeLeagueRecord,
  parseCards,
  parseLeagueRecord,
  parseSummary,
} from './_leagueRecord.js';
import { parsePokemonIds, recordToolExport } from './_exportStats.js';

/**
 * The gym leader maker's build beacon: one record per anonymous browser in
 * the `league:clients` hash, the way /api/submit keeps the dex builder's in
 * `clients`. Same cid, so the person who uses both tools is one field name
 * present in both hashes.
 */

const burstLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(500, '10 m'),
  analytics: false,
  prefix: 'rl:burst',
});
// Same per-browser cap as the dex, under its own key (`league:<cid>`), so
// the two tools' budgets are independent. See api/_limits.ts.
const clientLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(SUBMIT_CLIENT_DAILY_CAP, '1 d'),
  analytics: false,
  prefix: 'rl:client',
});

// Same compare-and-set as submit.ts: write only if the version is unchanged.
const CAS_LUA = `
local cur = redis.call('HGET', KEYS[2], ARGV[1]) or '0'
if cur == ARGV[2] then
  redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
  redis.call('HSET', KEYS[2], ARGV[1], tostring(tonumber(cur) + 1))
  return 1
end
return 0
`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const body = (req.body ?? {}) as {
      cid?: unknown;
      kind?: unknown;
      exportKind?: unknown;
      summary?: unknown;
      cards?: unknown;
      pokemonIds?: unknown;
      locale?: unknown;
      ref?: unknown;
      page?: unknown;
    };
    if (typeof body.cid !== 'string' || body.cid.length < 8 || body.cid.length > 64) {
      return res.status(400).json({ error: 'invalid cid' });
    }
    const cid = body.cid;
    if (!isLeagueBeaconKind(body.kind)) return res.status(400).json({ error: 'invalid kind' });
    const summary = parseSummary(body.summary);
    if (!summary) return res.status(400).json({ error: 'invalid summary' });
    // Bounded and field-by-field validated; a mangled card is dropped rather
    // than failing a beacon whose counts are still good. Undefined when the
    // client sent no structure, which leaves any stored structure alone.
    const cards = parseCards(body.cards);
    const exportKind = body.kind === 'export' ? (isLeagueExportKind(body.exportKind) ? body.exportKind : undefined) : undefined;
    if (body.kind === 'export' && !exportKind) return res.status(400).json({ error: 'invalid exportKind' });
    const pokemonIds = body.kind === 'export' ? parsePokemonIds(body.pokemonIds) : [];

    const countDrop = async (reason: 'rate-limit-ip' | 'rate-limit-client' | 'cap' | 'contention') => {
      try {
        await redis.hincrby('funnel', `league-drop:${reason}`, 1);
      } catch {
        // the drop still happens; only its bookkeeping failed
      }
    };

    const ip = getClientIp(req);
    const burst = await burstLimiter.limit(ip);
    if (!burst.success) {
      await countDrop('rate-limit-ip');
      res.setHeader('Retry-After', Math.ceil((burst.reset - Date.now()) / 1000));
      return res.status(429).json({ error: 'Too many requests' });
    }
    const perClient = await clientLimiter.limit(`league:${cid}`);
    if (!perClient.success) {
      await countDrop('rate-limit-client');
      res.setHeader('Retry-After', Math.ceil((perClient.reset - Date.now()) / 1000));
      return res.status(429).json({ error: 'Too many requests' });
    }

    const input = {
      cid,
      kind: body.kind,
      exportKind,
      summary,
      cards,
      now: Date.now(),
      geo: getGeo(req),
      ua: getClient(req),
      lang: getLang(req),
      locale: parseLocale(body.locale),
      referrer: parseReferrerHost(body.ref),
      page: parsePage(body.page),
    };

    for (let attempt = 0; attempt < 6; attempt++) {
      const [rawStr, verStr] = await Promise.all([
        redis.hget(LEAGUE_CLIENTS_KEY, cid) as Promise<unknown>,
        redis.hget(LEAGUE_VERSION_KEY, cid) as Promise<string | number | null>,
      ]);
      const existing = parseLeagueRecord(rawStr);
      const expectedVer = verStr == null ? '0' : String(verStr);
      if (!existing) {
        const count = await redis.hlen(LEAGUE_CLIENTS_KEY);
        if (count >= MAX_CLIENTS) {
          await countDrop('cap');
          return res.status(200).json({ ok: true, capped: true });
        }
      }
      const rec = mergeLeagueRecord(existing, input);
      const ok = await redis.eval(CAS_LUA, [LEAGUE_CLIENTS_KEY, LEAGUE_VERSION_KEY], [cid, expectedVer, JSON.stringify(rec)]);
      if (ok === 1) {
        if (exportKind) {
          const highlight = await recordToolExport(exportKind === 'card' ? 'card' : 'league', pokemonIds);
          return res.status(200).json({ ok: true, highlight });
        }
        return res.status(200).json({ ok: true });
      }
      await new Promise((r) => setTimeout(r, 15 + attempt * 20));
    }
    await countDrop('contention');
    return res.status(200).json({ ok: true, contended: true });
  } catch (err) {
    console.error('League error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
