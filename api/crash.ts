import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Ratelimit } from '@upstash/ratelimit';
import { MAX_CONTEXT_BYTES, sanitizeContext } from './feedback.js';
import { FEEDBACK_KEY, storeReport, underHourlyCap } from './_feedbackStore.js';
import { redis, getClientIp, isReadOnlyDeployment } from './_shared.js';

/**
 * Crash reports the error screen sends by itself.
 *
 * No person writes these, so the feedback form's checks for a typed message and
 * time on the form do not apply. What stands in for them: the report must carry
 * an error, its context goes through the same allow-list, and the limits are
 * tight. The client sends each distinct crash once per page load and three at
 * most, so a real browser stays far under them. Reports land in the feedback
 * list as category `crash`, where the admin's Feedback tab already reads.
 */

/** Global ceiling, so a crash that hits every visitor cannot fill the list. */
const GLOBAL_HOURLY_CAP = 100;

const ipLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(6, '10 m'),
  analytics: false,
  prefix: 'rl:crip',
});
const clientLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(10, '1 d'),
  analytics: false,
  prefix: 'rl:crclient',
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const context = sanitizeContext(body.context);
    const error = context.error as { message: string; stack: string } | undefined;
    if (!error || (!error.message && !error.stack)) return res.status(400).json({ error: 'no error' });
    if (JSON.stringify(context).length > MAX_CONTEXT_BYTES) {
      return res.status(400).json({ error: 'context too large' });
    }
    const cid = typeof body.cid === 'string' && body.cid.length <= 64 ? body.cid : undefined;

    if (isReadOnlyDeployment(req)) return res.status(200).json({ ok: true });
    const perIp = await ipLimiter.limit(getClientIp(req));
    if (!perIp.success) return res.status(429).json({ error: 'Too many requests' });
    if (cid && !(await clientLimiter.limit(cid)).success) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    if (!(await underHourlyCap(`${FEEDBACK_KEY}:crash`, GLOBAL_HOURLY_CAP))) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    await storeReport(req, { category: 'crash', message: '', cid, context });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Crash report error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
