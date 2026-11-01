import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Ratelimit } from '@upstash/ratelimit';
import { sanitizeFavoriteFeedback } from './_favoriteFeedback.js';
import { FEEDBACK_KEY, storeReport, underHourlyCap } from './_feedbackStore.js';
import { redis, getClientIp, isReadOnlyDeployment } from './_shared.js';
import { parseAutoFlag } from './_automation.js';
import { FEEDBACK_MESSAGE_MAX_CHARS, FEEDBACK_MIN_CHARS } from '../src/lib/feedbackLimits.js';

const CATEGORIES = new Set(['bug', 'translation', 'idea', 'data', 'other']);

/** Serialized context cap. Rejected rather than truncated — a silently clipped
 *  context is worse than none, because it reads as complete. */
export const MAX_CONTEXT_CODE_UNITS = 4096;
const MIN_DWELL_MS = 2000;
const GLOBAL_HOURLY_CAP = 200;

const ipLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(5, '10 m'),
  analytics: false,
  prefix: 'rl:fbip',
});
const clientLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(10, '1 d'),
  analytics: false,
  prefix: 'rl:fbclient',
});

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
      ...(str(err.where, 40) ? { where: str(err.where, 40) } : {}),
    };
  }

  return out;
}

function urlCount(text: string): number {
  return (text.match(/https?:\/\//gi) ?? []).length;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;

    if (typeof body.website === 'string' && body.website.trim()) {
      return res.status(200).json({ ok: true });
    }

    const category = typeof body.category === 'string' && CATEGORIES.has(body.category) ? body.category : null;
    if (!category) return res.status(400).json({ error: 'invalid category' });

    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message.length < FEEDBACK_MIN_CHARS || message.length > FEEDBACK_MESSAGE_MAX_CHARS) {
      return res.status(400).json({ error: 'invalid message' });
    }
    if (urlCount(message) >= 3) return res.status(400).json({ error: 'invalid message' });

    const dwellMs = typeof body.dwellMs === 'number' ? body.dwellMs : 0;
    if (dwellMs < MIN_DWELL_MS) return res.status(400).json({ error: 'too fast' });

    const context = sanitizeContext(body.context);
    if (JSON.stringify(context).length > MAX_CONTEXT_CODE_UNITS) {
      return res.status(400).json({ error: 'context too large' });
    }

    const cid = str(body.cid, 64);

    if (parseAutoFlag(body.auto) || isReadOnlyDeployment(req)) return res.status(200).json({ ok: true });
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

    if (!(await underHourlyCap(FEEDBACK_KEY, GLOBAL_HOURLY_CAP))) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    await storeReport(req, { category, message, cid, context });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Feedback error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
