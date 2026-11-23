import type { VercelRequest, VercelResponse } from './_vercel.js';
import { Ratelimit } from '@upstash/ratelimit';
import { redis, getNetworkKey, isReadOnlyDeployment, parseClientId } from './_shared.js';
import { parseAutoFlag } from './_automation.js';
import {
  appendExportSurveySkip,
  EXPORT_SURVEY_SKIP_EVENT,
  EXPORT_SURVEY_SKIPS_KEY,
  isFunnelEvent,
  isLeagueExportEvent,
  parseExportSurveySkipFields,
  parseExportSurveySkipList,
  parseExportSurveyToolField,
  parsePage,
  parseTool,
  JOURNAL_MAX_PER_DAY,
  JOURNAL_PREFIX,
  JOURNAL_TTL_S,
} from './_events.js';

const FUNNEL_KEY = 'funnel';

const burstLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(500, '10 m'),
  analytics: false,
  prefix: 'rl:evburst',
});
const clientLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(200, '1 d'),
  analytics: false,
  prefix: 'rl:evclient',
});
const NETWORK_EVENTS_PER_DAY = 600;
const networkLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(NETWORK_EVENTS_PER_DAY, '1 d'),
  analytics: false,
  prefix: 'rl:evnet',
});

function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const body = (req.body ?? {}) as {
      cid?: unknown;
      event?: unknown;
      tool?: unknown;
      page?: unknown;
      exportTool?: unknown;
      reason?: unknown;
      auto?: unknown;
    };
    const cid = parseClientId(body.cid);
    if (!cid) return res.status(400).json({ error: 'invalid cid' });
    if (!isFunnelEvent(body.event)) {
      return res.status(400).json({ error: 'invalid event' });
    }
    const skipFields =
      body.event === EXPORT_SURVEY_SKIP_EVENT ? parseExportSurveySkipFields(body) : null;
    if (body.event === EXPORT_SURVEY_SKIP_EVENT && !skipFields) {
      return res.status(400).json({ error: 'invalid skip' });
    }
    const tool = parseTool(body.tool);
    const page = parsePage(body.page);
    const exportTool =
      skipFields?.tool ??
      (isLeagueExportEvent(body.event) ? parseExportSurveyToolField(body.exportTool) : undefined);

    if (parseAutoFlag(body.auto) || isReadOnlyDeployment(req)) return res.status(200).json({ ok: true });
    const burst = await burstLimiter.limit(getNetworkKey(req));
    if (!burst.success) {
      res.setHeader('Retry-After', Math.ceil((burst.reset - Date.now()) / 1000));
      return res.status(429).json({ error: 'Too many requests' });
    }
    for (const limit of [() => clientLimiter.limit(cid), () => networkLimiter.limit(getNetworkKey(req))]) {
      const result = await limit();
      if (!result.success) {
        res.setHeader('Retry-After', Math.ceil((result.reset - Date.now()) / 1000));
        return res.status(429).json({ error: 'Too many requests' });
      }
    }

    const now = Date.now();
    const day = dayKey(now);
    const dailyKey = `${FUNNEL_KEY}:${day}`;
    const journalKey = `${JOURNAL_PREFIX}:${day}`;
    const entry = JSON.stringify({
      t: now,
      cid,
      tool,
      ev: body.event,
      ...(page ? { page } : {}),
      ...(exportTool ? { exportTool } : {}),
      ...(skipFields ? { reason: skipFields.reason } : {}),
    });
    // platform: An Upstash pipeline runs its commands in order in one request, so each key exists before its EXPIRE and RPUSH precedes LTRIM.
    const writes = redis
      .pipeline()
      .hincrby(FUNNEL_KEY, body.event, 1)
      .hincrby(dailyKey, body.event, 1)
      .rpush(journalKey, entry);
    if (skipFields) {
      const prev = parseExportSurveySkipList(await redis.hget(EXPORT_SURVEY_SKIPS_KEY, cid));
      const next = appendExportSurveySkip(prev, {
        t: now,
        tool: skipFields.tool,
        reason: skipFields.reason,
      });
      writes.hset(EXPORT_SURVEY_SKIPS_KEY, { [cid]: JSON.stringify(next) });
    }
    await writes
      .expire(journalKey, JOURNAL_TTL_S)
      .ltrim(journalKey, -JOURNAL_MAX_PER_DAY, -1)
      .exec();

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Event error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
