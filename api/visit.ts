import type { VercelRequest, VercelResponse } from './_vercel.js';
import { Ratelimit } from '@upstash/ratelimit';
import { redis, getNetworkKey, isReadOnlyDeployment } from './_shared.js';
import { parseAutoFlag } from './_automation.js';
import { TOOLS, type Tool } from './_events.js';
import { VISIT_PAGES, VISITS_PREFIX, visitFields, type VisitPage } from './_visits.js';

const burstLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(300, '10 m'),
  analytics: false,
  prefix: 'rl:viburst',
});

const COUNT_VISIT = `
for i = 1, #ARGV do
  redis.call('HINCRBY', KEYS[1], ARGV[i], 1)
end
return #ARGV
`;

const isTool = (v: unknown): v is Tool => typeof v === 'string' && (TOOLS as readonly string[]).includes(v);
const isPage = (v: unknown): v is VisitPage => typeof v === 'string' && (VISIT_PAGES as readonly string[]).includes(v);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const body = (req.body ?? {}) as { tool?: unknown; page?: unknown; out?: unknown; auto?: unknown };
    if (!isTool(body.tool)) return res.status(400).json({ error: 'invalid tool' });
    if (parseAutoFlag(body.auto) || isReadOnlyDeployment(req)) return res.status(200).json({ ok: true });

    const burst = await burstLimiter.limit(getNetworkKey(req));
    if (!burst.success) {
      res.setHeader('Retry-After', Math.ceil((burst.reset - Date.now()) / 1000));
      return res.status(429).json({ error: 'Too many requests' });
    }

    const fields = visitFields(body.tool, isPage(body.page) ? body.page : 'other', body.out === true);
    const key = `${VISITS_PREFIX}:${new Date().toISOString().slice(0, 10)}`;
    await redis.eval(COUNT_VISIT, [key], fields);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Visit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
