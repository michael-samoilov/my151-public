import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Ratelimit } from '@upstash/ratelimit';
import { redis, getClientIp } from './_shared.js';

/**
 * Lightweight funnel-event counters. Deliberately SEPARATE from the per-client
 * records in submit.ts: those represent people who placed Pokémon (the app's
 * "users"), whereas these events include top-of-funnel signals that fire with
 * zero placements (saw the intro, bounced). Recording them as their own
 * aggregate counters keeps the user analytics from ballooning with every
 * page-load visitor. The client de-dupes once-per-user events in localStorage,
 * so a raw count ≈ distinct users for those.
 *
 * Storage: HINCRBY into `funnel` (all-time totals) and `funnel:<YYYY-MM-DD>`
 * (per-day, expiring) so both totals and a coarse time series are available.
 */

const FUNNEL_EVENTS = new Set<string>([
  'intro-shown',
  'intro-cta',
  'intro-dismiss',
  'milestone-25',
  'milestone-100',
  'milestone-151',
  'view-visit',
]);

const FUNNEL_KEY = 'funnel';
const DAILY_TTL_S = 120 * 24 * 60 * 60; // keep ~4 months of daily buckets

const burstLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(500, '10 m'),
  analytics: false,
  prefix: 'rl:evburst',
});
const clientLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 d'),
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
    const body = (req.body ?? {}) as { cid?: unknown; event?: unknown };
    if (typeof body.cid !== 'string' || body.cid.length < 8 || body.cid.length > 64) {
      return res.status(400).json({ error: 'invalid cid' });
    }
    if (typeof body.event !== 'string' || !FUNNEL_EVENTS.has(body.event)) {
      return res.status(400).json({ error: 'invalid event' });
    }

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

    const dailyKey = `${FUNNEL_KEY}:${dayKey(Date.now())}`;
    await Promise.all([
      redis.hincrby(FUNNEL_KEY, body.event, 1),
      redis.hincrby(dailyKey, body.event, 1),
    ]);
    await redis.expire(dailyKey, DAILY_TTL_S);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Event error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
