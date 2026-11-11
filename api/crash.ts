import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Ratelimit } from '@upstash/ratelimit';
import { MAX_CONTEXT_CODE_UNITS, sanitizeContext } from './feedback.js';
import { CRASH_KEY, storeReport, underHourlyCap } from './_feedbackStore.js';
import { redis, getClientIp, isReadOnlyDeployment, parseClientId } from './_shared.js';
import { parseAutoFlag } from './_automation.js';

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
    if (JSON.stringify(context).length > MAX_CONTEXT_CODE_UNITS) {
      return res.status(400).json({ error: 'context too large' });
    }
    const cid = parseClientId(body.cid);

    if (parseAutoFlag(body.auto) || isReadOnlyDeployment(req)) return res.status(200).json({ ok: true });
    const perIp = await ipLimiter.limit(getClientIp(req));
    if (!perIp.success) return res.status(429).json({ error: 'Too many requests' });
    if (cid && !(await clientLimiter.limit(cid)).success) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    if (!(await underHourlyCap(CRASH_KEY, GLOBAL_HOURLY_CAP))) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    await storeReport(req, CRASH_KEY, { category: 'crash', message: '', cid, context });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Crash report error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
