import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Ratelimit } from '@upstash/ratelimit';
import { createHash, randomUUID } from 'node:crypto';
import { sanitizeFavoriteFeedback } from './_favoriteFeedback.js';
import { redis, getClientIp, isReadOnlyDeployment } from './_shared.js';

/**
 * Human-authored feedback: bug reports, translation corrections, ideas.
 *
 * Modelled on event.ts, with the limits turned down hard. Funnel events are
 * machine-generated and expected in volume; these are typed by a person, so
 * anything arriving faster than a person can type is either a mistake or an
 * attack. There is no public read path — the admin dashboard is the only reader.
 *
 * Storage mirrors the counters-vs-records split the rest of the API uses:
 * `feedback` is a capped LIST (newest first, so LRANGE pages it in the order
 * the admin wants) and `feedback:count:<day>` is a hash of per-category totals.
 * LTRIM bounds growth with no cron job to forget about.
 */

const FEEDBACK_KEY = 'feedback';
const COUNT_PREFIX = 'feedback:count';
/** Reports kept. At the volume a hobby site sees this is years of history. */
const MAX_STORED = 5000;
const DAILY_TTL_S = 400 * 24 * 60 * 60;

const CATEGORIES = new Set(['bug', 'translation', 'idea', 'data', 'other']);

const MIN_MESSAGE = 4;
const MAX_MESSAGE = 1000;
/** Serialized context cap. Rejected rather than truncated — a silently clipped
 *  context is worse than none, because it reads as complete. */
const MAX_CONTEXT_BYTES = 4096;
/** Faster than this after the form opened and it was not typed by a person. */
const MIN_DWELL_MS = 2000;
/** Global ceiling, so a distributed flood still cannot fill the list. */
const GLOBAL_HOURLY_CAP = 200;

const ipLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '10 m'),
  analytics: false,
  prefix: 'rl:fbip',
});
const clientLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 d'),
  analytics: false,
  prefix: 'rl:fbclient',
});

function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10); // UTC YYYY-MM-DD
}

function str(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return undefined;
  return trimmed;
}

function strArray(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .slice(0, maxItems)
    .map((v) => v.slice(0, maxLen));
}

/**
 * Rebuild the context from an allow-list rather than storing what the client
 * sent. Arbitrary client JSON in a store the admin page renders is how a
 * feedback form turns into a persistence and injection surface; every field
 * here is one this app's own collector produces, clamped to its own type.
 */
export function sanitizeContext(raw: unknown): Record<string, unknown> {
  const c = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {
    route: str(c.route, 40) ?? 'unknown',
    locale: str(c.locale, 16) ?? 'unknown',
    localeAuto: c.localeAuto === true,
    languages: strArray(c.languages, 5, 32),
    version: str(c.version, 40) ?? '',
    viewport: str(c.viewport, 20) ?? '',
    dpr: typeof c.dpr === 'number' && Number.isFinite(c.dpr) ? Math.min(8, Math.max(0, c.dpr)) : 1,
    ua: str(c.ua, 200) ?? '',
    placed: typeof c.placed === 'number' && Number.isFinite(c.placed) ? Math.min(1000, Math.max(0, Math.trunc(c.placed))) : 0,
    search: c.search === true,
    filters: strArray(c.filters, 12, 24),
    demo: c.demo === true,
  };

  if (out.route === '/favorite-pokemon-picker' || out.route === '/favorite-pokemon-by-type') {
    const favorites = sanitizeFavoriteFeedback(c.favorites);
    if (favorites) out.favorites = favorites;
  }

  if (c.exportSurvey === true) out.exportSurvey = true;
  if (c.exportTool === 'pokedex' || c.exportTool === 'league' || c.exportTool === 'card') {
    out.exportTool = c.exportTool;
  }

  const msg = (c.message ?? null) as Record<string, unknown> | null;
  if (msg && typeof msg === 'object') {
    const key = str(msg.key, 120);
    if (key) {
      out.message = {
        key,
        localeValue: str(msg.localeValue, 400) ?? '',
        sourceValue: str(msg.sourceValue, 400) ?? '',
      };
    }
  }

  const err = (c.error ?? null) as Record<string, unknown> | null;
  if (err && typeof err === 'object') {
    out.error = {
      name: str(err.name, 80) ?? 'Error',
      message: str(err.message, 400) ?? '',
      stack: str(err.stack, 2000) ?? '',
      componentStack: str(err.componentStack, 2000) ?? '',
    };
  }

  return out;
}

/** URLs in the body, the cheapest spam signal that costs a real user nothing. */
function urlCount(text: string): number {
  return (text.match(/https?:\/\//gi) ?? []).length;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;

    // Honeypot: hidden from sight and from the accessibility tree, so only an
    // automated form-filler reaches it. Answered with 200 rather than an error —
    // a bot that learns it was caught just tries again differently.
    if (typeof body.website === 'string' && body.website.trim()) {
      return res.status(200).json({ ok: true });
    }

    const category = typeof body.category === 'string' && CATEGORIES.has(body.category) ? body.category : null;
    if (!category) return res.status(400).json({ error: 'invalid category' });

    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message.length < MIN_MESSAGE || message.length > MAX_MESSAGE) {
      return res.status(400).json({ error: 'invalid message' });
    }
    if (urlCount(message) >= 3) return res.status(400).json({ error: 'invalid message' });

    // No contact field: the form deliberately does not ask for one, so anything
    // arriving here claiming to be an address is either an old client or a bot.
    // Dropped rather than stored — an endpoint that quietly accepts PII it never
    // asked for is the same problem as a form that asks.

    const dwellMs = typeof body.dwellMs === 'number' ? body.dwellMs : 0;
    if (dwellMs < MIN_DWELL_MS) return res.status(400).json({ error: 'too fast' });

    const context = sanitizeContext(body.context);
    if (JSON.stringify(context).length > MAX_CONTEXT_BYTES) {
      return res.status(400).json({ error: 'context too large' });
    }

    const cid = str(body.cid, 64);

    if (isReadOnlyDeployment(req)) return res.status(200).json({ ok: true });
    const ip = getClientIp(req);
    const perIp = await ipLimiter.limit(ip);
    if (!perIp.success) {
      res.setHeader('Retry-After', Math.ceil((perIp.reset - Date.now()) / 1000));
      return res.status(429).json({ error: 'Too many requests' });
    }
    if (cid) {
      const perClient = await clientLimiter.limit(cid);
      if (!perClient.success) {
        res.setHeader('Retry-After', Math.ceil((perClient.reset - Date.now()) / 1000));
        return res.status(429).json({ error: 'Too many requests' });
      }
    }

    const now = Date.now();
    const hourKey = `${FEEDBACK_KEY}:global:${new Date(now).toISOString().slice(0, 13)}`;
    const globalCount = await redis.incr(hourKey);
    if (globalCount === 1) await redis.expire(hourKey, 2 * 60 * 60);
    if (globalCount > GLOBAL_HOURLY_CAP) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    // The IP is hashed, never stored: enough to see that twenty reports came
    // from one place, not enough to say where that place is. The salt is the
    // admin token, which already has to exist and never leaves the server.
    const ipHash = createHash('sha256')
      .update(`${ip}|${process.env.ADMIN_TOKEN ?? ''}`)
      .digest('hex')
      .slice(0, 16);

    const country = Array.isArray(req.headers['x-vercel-ip-country'])
      ? req.headers['x-vercel-ip-country'][0]
      : req.headers['x-vercel-ip-country'];

    const record = {
      id: randomUUID(),
      ts: now,
      category,
      message,
      ...(cid ? { cid } : {}),
      ipHash,
      ...(country ? { country: String(country).slice(0, 4) } : {}),
      context,
    };

    const dailyKey = `${COUNT_PREFIX}:${dayKey(now)}`;
    await redis.lpush(FEEDBACK_KEY, JSON.stringify(record));
    await redis.ltrim(FEEDBACK_KEY, 0, MAX_STORED - 1);
    await redis.hincrby(dailyKey, category, 1);
    await redis.expire(dailyKey, DAILY_TTL_S);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Feedback error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
