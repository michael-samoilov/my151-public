import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Ratelimit } from '@upstash/ratelimit';
import { redis, getClientIp } from './_shared.js';
import {
  appendExportSurveySkip,
  EXPORT_SURVEY_SKIP_EVENT,
  EXPORT_SURVEY_SKIPS_KEY,
  isFunnelEvent,
  parseExportSurveySkipFields,
  parseExportSurveySkipList,
  parsePage,
  parseTool,
  JOURNAL_MAX_PER_DAY,
  JOURNAL_PREFIX,
  JOURNAL_TTL_S,
} from './_events.js';

/**
 * Lightweight funnel-event counters. Deliberately SEPARATE from the per-client
 * records in submit.ts and league.ts: those represent people who placed
 * something (the tools' "users"), whereas these events include top-of-funnel
 * signals that fire with zero placements (saw the hub, saw the intro,
 * bounced). Recording them as their own aggregate counters keeps the user
 * analytics from ballooning with every page-load visitor. The client de-dupes
 * once-per-user events in localStorage, so a raw count ≈ distinct users for
 * those.
 *
 * Storage, three shapes:
 *  - HINCRBY into `funnel` (all-time totals) and `funnel:<YYYY-MM-DD>`
 *    (per-day, expiring): cheap reads for the dashboard.
 *  - RPUSH into `journal:<YYYY-MM-DD>`: one compact raw entry per event,
 *    with the cid, tool and page. Counters answer only the questions they
 *    were created for; the journal lets a question asked later be answered
 *    from launch day. Capped per day and expiring, so it cannot grow without
 *    bound.
 */

const FUNNEL_KEY = 'funnel';
const DAILY_TTL_S = 120 * 24 * 60 * 60; // keep ~4 months of daily buckets

const burstLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(500, '10 m'),
  analytics: false,
  prefix: 'rl:evburst',
});
// Per browser. Once-per-browser events cost one each for the life of the
// browser; the per-click ones (hub cards, league exports) are what the
// budget is for. 200 is well past a real day and well short of a script.
const clientLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(200, '1 d'),
  analytics: false,
  prefix: 'rl:evclient',
});

function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10); // UTC YYYY-MM-DD
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
      ...(skipFields ? { exportTool: skipFields.tool, reason: skipFields.reason } : {}),
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
      redis.expire(dailyKey, DAILY_TTL_S),
      redis.expire(journalKey, JOURNAL_TTL_S),
      redis.ltrim(journalKey, -JOURNAL_MAX_PER_DAY, -1),
    ]);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Event error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
