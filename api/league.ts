import {parseAttentionForIngest} from './_attention.js';
import {acknowledgeUnstored,appendMinuteActivity} from './_activityHistoryStore.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Ratelimit } from '@upstash/ratelimit';
import { SUBMIT_CLIENT_DAILY_CAP } from './_limits.js';
import { parseFunnelEventList, parsePage } from './_events.js';
import { redis, getNetworkKey, getClient, getGeo, getLang, isReadOnlyDeployment, parseLocale, parseReferrerHost, MAX_CLIENTS, parseClientId, bodyTooLarge, admitNewClient, noteNewClient } from './_shared.js';
import { parseCapturedAt, parseSeenDays } from './_sessionize.js';
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
import { parseNotmeFlag, parsePokemonIds, recordToolExport } from './_exportStats.js';
import { parseAutoFlag } from './_automation.js';

const burstLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(500, '10 m'),
  analytics: false,
  prefix: 'rl:burst',
});
const clientLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(SUBMIT_CLIENT_DAILY_CAP, '1 d'),
  analytics: false,
  prefix: 'rl:client',
});

const CAS_LUA = `
local cur = redis.call('HGET', KEYS[2], ARGV[1]) or '0'
if cur == ARGV[2] then
  if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 and redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[4]) then return 2 end
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
  if (bodyTooLarge(req)) {
    return res.status(413).json({ error: 'Body too large' });
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
      switched?: unknown;
      ref?: unknown;
      page?: unknown;
      attention?: unknown;
      seen?: unknown;
      activity?: unknown;
      ts?: unknown;
      notme?: unknown;
      auto?: unknown;
      events?: unknown;
    };
    const cid = parseClientId(body.cid);
    if (!cid) return res.status(400).json({ error: 'invalid cid' });
    const receivedAt=Date.now();
    const attention=parseAttentionForIngest(body.attention,receivedAt);
    if(attention===null)return res.status(400).json({error:'invalid attention'});
    if (!isLeagueBeaconKind(body.kind)) return res.status(400).json({ error: 'invalid kind' });
    const summary = parseSummary(body.summary);
    if (!summary) return res.status(400).json({ error: 'invalid summary' });
    const cards = parseCards(body.cards);
    const exportKind = body.kind === 'export' ? (isLeagueExportKind(body.exportKind) ? body.exportKind : undefined) : undefined;
    if (body.kind === 'export' && !exportKind) return res.status(400).json({ error: 'invalid exportKind' });
    const pokemonIds = body.kind === 'export' ? parsePokemonIds(body.pokemonIds) : [];
    const notme = parseNotmeFlag(body.notme);
    if (notme || parseAutoFlag(body.auto) || isReadOnlyDeployment(req)) {
      const activityAck = acknowledgeUnstored(body.activity, receivedAt);
      if (exportKind) {
        const highlight = await recordToolExport(
          exportKind === 'card' ? 'card' : 'league',
          pokemonIds,
          { notme: true },
        );
        return res.status(200).json({ ok: true, highlight, activityAck });
      }
      return res.status(200).json({ ok: true, activityAck });
    }

    const countDrop = async (reason: 'rate-limit-ip' | 'rate-limit-client' | 'new-client-limit' | 'cap' | 'contention') => {
      try {
        await redis.hincrby('funnel', `league-drop:${reason}`, 1);
      } catch {
        return;
      }
    };

    const burst = await burstLimiter.limit(getNetworkKey(req));
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

    const captured = parseCapturedAt(body.ts, receivedAt);
    const input = {
      cid,
      kind: body.kind,
      exportKind,
      summary,
      cards,
      now: captured ?? receivedAt,
      receivedAt,
      attention,
      seen: parseSeenDays(body.seen, receivedAt),
      capturedKnown: captured !== null,
      geo: getGeo(req),
      ua: getClient(req),
      lang: getLang(req),
      locale: parseLocale(body.locale),
      switched: parseLocale(body.switched),
      referrer: parseReferrerHost(body.ref),
      page: parsePage(body.page),
      events: parseFunnelEventList(body.events),
    };

    let admitted = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      const [rawStr, verStr] = await Promise.all([
        redis.hget(LEAGUE_CLIENTS_KEY, cid) as Promise<unknown>,
        redis.hget(LEAGUE_VERSION_KEY, cid) as Promise<string | number | null>,
      ]);
      const existing = parseLeagueRecord(rawStr);
      const expectedVer = verStr == null ? '0' : String(verStr);
      if (!existing && !admitted) {
        if (!(await admitNewClient(req, 'league', receivedAt))) {
          await countDrop('new-client-limit');
          return res.status(200).json({ ok: true, limited: true });
        }
        admitted = true;
      }
      const rec = mergeLeagueRecord(existing, input);
      const ok = await redis.eval(CAS_LUA, [LEAGUE_CLIENTS_KEY, LEAGUE_VERSION_KEY], [cid, expectedVer, JSON.stringify(rec), MAX_CLIENTS]);
      if (ok === 2) {
        await countDrop('cap');
        return res.status(200).json({ ok: true, capped: true });
      }
      if (ok === 1) {
        const [activityAck, highlight] = await Promise.all([
          appendMinuteActivity(cid, 'league', body.activity, receivedAt),
          exportKind ? recordToolExport(exportKind === 'card' ? 'card' : 'league', pokemonIds) : undefined,
          existing ? undefined : noteNewClient(LEAGUE_CLIENTS_KEY, 'league'),
        ]);
        if (exportKind) return res.status(200).json({ ok: true, highlight, activityAck });
        return res.status(200).json({ ok: true, activityAck });
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
