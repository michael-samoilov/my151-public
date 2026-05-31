import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Ratelimit } from '@upstash/ratelimit';
import { redis, getClientIp, isMilestone, isSource, type Source } from './_shared';

const MAX_POKEMON_ID = 1025;

// Cap stored submissions per source so the lists can't grow unbounded.
// LTRIM keeps the most recent MAX_STORED_SUBMISSIONS entries.
const MAX_STORED_SUBMISSIONS = 10000;

// Rate limiters: per-IP, analytics disabled to avoid doubling Upstash command count.
const completionLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(2, '1 d'),
  analytics: false,
  prefix: 'rl:completion',
});
const exportLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(20, '1 d'),
  analytics: false,
  prefix: 'rl:export',
});
const burstLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(500, '10 m'),
  analytics: false,
  prefix: 'rl:burst',
});
// Milestone beacons are deduped client-side per browser, but cap per IP too
// so a single client can't inflate the human-engagement counters.
const milestoneLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(10, '1 d'),
  analytics: false,
  prefix: 'rl:milestone',
});

// Pokedex script: per-Pokemon picks + all-time total + capped snapshot list +
// by-country tally, in one Upstash command regardless of ID count.
// KEYS[1] = picks:<source>   KEYS[2] = total:<source>
// KEYS[3] = submissions:<source>   KEYS[4] = countries:<source>
// ARGV[1] = full submission entry (JSON string)
// ARGV[2] = max stored submissions (cap for LTRIM)
// ARGV[3] = country code ('' if unknown)
// ARGV[4..] = list of pokemon IDs as strings
const SUBMIT_LUA = `
for i = 4, #ARGV do
  redis.call('HINCRBY', KEYS[1], ARGV[i], 1)
end
redis.call('INCR', KEYS[2])
redis.call('LPUSH', KEYS[3], ARGV[1])
redis.call('LTRIM', KEYS[3], 0, tonumber(ARGV[2]) - 1)
if ARGV[3] ~= '' then
  redis.call('HINCRBY', KEYS[4], ARGV[3], 1)
end
return 1
`;

// Milestone script: all-time counter + by-country tally + capped snapshot list.
// No `picks` aggregate — these measure engagement, not Pokemon popularity.
// KEYS[1] = total:<source>   KEYS[2] = countries:<source>   KEYS[3] = submissions:<source>
// ARGV[1] = country code ('' if unknown)
// ARGV[2] = full snapshot entry (JSON string)
// ARGV[3] = max stored submissions (cap for LTRIM)
const MILESTONE_LUA = `
redis.call('INCR', KEYS[1])
if ARGV[1] ~= '' then
  redis.call('HINCRBY', KEYS[2], ARGV[1], 1)
end
redis.call('LPUSH', KEYS[3], ARGV[2])
redis.call('LTRIM', KEYS[3], 0, tonumber(ARGV[3]) - 1)
return 1
`;

function header(req: VercelRequest, name: string): string | undefined {
  const v = req.headers[name];
  const raw = Array.isArray(v) ? v[0] : v;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

/** Coarse geo from Vercel's IP headers. Country/region/timezone only — we
 *  deliberately skip city + lat/long to keep this low-sensitivity. Vercel's
 *  'XX' placeholder for an unknown country is normalized to undefined so it
 *  never pollutes the by-country tally. */
function getGeo(req: VercelRequest) {
  const country = header(req, 'x-vercel-ip-country');
  return {
    country: country && country !== 'XX' ? country : undefined,
    region: header(req, 'x-vercel-ip-country-region'),
    tz: header(req, 'x-vercel-ip-timezone'),
  };
}

/** Primary language tag from Accept-Language, e.g. "en-US". */
function getLang(req: VercelRequest): string | undefined {
  const al = header(req, 'accept-language');
  if (!al) return undefined;
  const first = al.split(',')[0]?.split(';')[0]?.trim();
  return first || undefined;
}

/** Best-effort device/browser/OS classification from the User-Agent string.
 *  Lightweight substring matching — enough for "mobile iOS Safari" style
 *  buckets without pulling in a UA-parsing dependency. */
function getClient(req: VercelRequest) {
  const ua = header(req, 'user-agent') ?? '';

  let os = 'Unknown';
  if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';

  // Order matters: Edge/Opera/CriOS UAs also contain "Chrome"; Chrome/Edge
  // also contain "Safari"; check the more specific tokens first.
  let browser = 'Unknown';
  if (/Edg(?:A|iOS)?\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';
  else if (/Firefox\/|FxiOS\//i.test(ua)) browser = 'Firefox';
  else if (/CriOS\//i.test(ua)) browser = 'Chrome';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  const device = /Mobi|iPhone|iPod|Android.*Mobile/i.test(ua)
    ? 'Mobile'
    : /iPad|Tablet|Android/i.test(ua)
      ? 'Tablet'
      : 'Desktop';

  return { device, os, browser };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { ids, source } = req.body as { ids: unknown; source: unknown };

    // Validate source
    if (typeof source !== 'string' || !isSource(source)) {
      return res.status(400).json({ error: 'invalid source' });
    }
    const src: Source = source;

    const ip = getClientIp(req);
    const geo = getGeo(req);

    // Validate IDs array. Milestone snapshots carry 1-151 ids (the build so
    // far); pokedex sources the same, with completion pinned to exactly 151.
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 151) {
      return res.status(400).json({ error: 'Expected 1-151 Pokemon IDs' });
    }
    if (src === 'completion' && ids.length !== 151) {
      return res.status(400).json({ error: 'Completion requires exactly 151 Pokemon IDs' });
    }

    const seen = new Set<number>();
    for (const id of ids) {
      if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > MAX_POKEMON_ID) {
        return res.status(400).json({ error: `Invalid Pokemon ID: ${id}` });
      }
      if (seen.has(id)) {
        return res.status(400).json({ error: `Duplicate Pokemon ID: ${id}` });
      }
      seen.add(id);
    }

    // Rate limit per IP before touching state.
    const burst = await burstLimiter.limit(ip);
    if (!burst.success) {
      res.setHeader('Retry-After', Math.ceil((burst.reset - Date.now()) / 1000));
      return res.status(429).json({ error: 'Too many requests' });
    }
    const perSource = isMilestone(src)
      ? await milestoneLimiter.limit(`${src}:${ip}`)
      : src === 'completion'
        ? await completionLimiter.limit(ip)
        : await exportLimiter.limit(ip);
    if (!perSource.success) {
      res.setHeader('Retry-After', Math.ceil((perSource.reset - Date.now()) / 1000));
      return res.status(429).json({ error: 'Too many requests' });
    }

    // Submission entry: the build (full pokedex, or the snapshot at the moment
    // a milestone fired) plus a unique id, datetime, and coarse request-derived
    // context. The id (timestamp + random) is what delete-entry matches on, so
    // entries sharing a millisecond are still individually addressable.
    const submittedAt = Date.now();
    const entryId = `${submittedAt}-${Math.random().toString(36).slice(2, 10)}`;
    const client = getClient(req);
    const entry = JSON.stringify({
      id: entryId,
      ids,
      source: src,
      ts: submittedAt,
      at: new Date(submittedAt).toISOString(),
      country: geo.country,
      region: geo.region,
      tz: geo.tz,
      lang: getLang(req),
      device: client.device,
      os: client.os,
      browser: client.browser,
    });

    if (isMilestone(src)) {
      await redis.eval(
        MILESTONE_LUA,
        [`total:${src}`, `countries:${src}`, `submissions:${src}`],
        [geo.country ?? '', entry, String(MAX_STORED_SUBMISSIONS)],
      );
      return res.status(200).json({ ok: true });
    }

    await redis.eval(
      SUBMIT_LUA,
      [`picks:${src}`, `total:${src}`, `submissions:${src}`, `countries:${src}`],
      [entry, String(MAX_STORED_SUBMISSIONS), geo.country ?? '', ...ids.map(String)],
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Submit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
