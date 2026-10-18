import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Ratelimit } from '@upstash/ratelimit';
import { redis, getClientIp, isReadOnlyDeployment } from './_shared.js';
import { FUNNEL_DAY_TTL_S } from './_range.js';
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
    };
    if (typeof body.cid !== 'string' || body.cid.length < 8 || body.cid.length > 64) {
      return res.status(400).json({ error: 'invalid cid' });
    }
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

    if (isReadOnlyDeployment(req)) return res.status(200).json({ ok: true });
    const ip = getClientIp(req);
    const burst = await burstLimiter.limit(ip);
    if (!burst.success) {
      res.setHeader('Retry-After', Math.ceil((burst.reset - Date.now()) / 1000));
      return res.status(429).json({ error: 'Too many requests' });
    }
    const perClient = await clientLimiter.limit(body.cid);
    if (!perClient.success) {
      res.setHeader('Retry-After', Math.ceil((perClient.reset - Date.now()) / 1000));
      return res.status(429).json({ error: 'Too many requests' });
    }

    const now = Date.now();
    const day = dayKey(now);
    const dailyKey = `${FUNNEL_KEY}:${day}`;
    const journalKey = `${JOURNAL_PREFIX}:${day}`;
    const entry = JSON.stringify({
      t: now,
      cid: body.cid,
      tool,
      ev: body.event,
      ...(page ? { page } : {}),
      ...(exportTool ? { exportTool } : {}),
      ...(skipFields ? { reason: skipFields.reason } : {}),
    });
    const writes: Promise<unknown>[] = [
      redis.hincrby(FUNNEL_KEY, body.event, 1),
      redis.hincrby(dailyKey, body.event, 1),
      redis.rpush(journalKey, entry),
    ];
    if (skipFields) {
      const prev = parseExportSurveySkipList(await redis.hget(EXPORT_SURVEY_SKIPS_KEY, body.cid));
      const next = appendExportSurveySkip(prev, {
        t: now,
        tool: skipFields.tool,
        reason: skipFields.reason,
      });
      writes.push(redis.hset(EXPORT_SURVEY_SKIPS_KEY, { [body.cid]: JSON.stringify(next) }));
    }
    await Promise.all(writes);
    await Promise.all([
      redis.expire(dailyKey, FUNNEL_DAY_TTL_S),
      redis.expire(journalKey, JOURNAL_TTL_S),
      redis.ltrim(journalKey, -JOURNAL_MAX_PER_DAY, -1),
    ]);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Event error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
