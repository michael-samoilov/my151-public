import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const VALID_SOURCES = ['completion', 'export'] as const;
type Source = typeof VALID_SOURCES[number];

// Engagement milestones — counter-only sources (no stored pokedexes).
const MILESTONE_SOURCES = ['interacted', 'engaged'] as const;
type MilestoneSource = typeof MILESTONE_SOURCES[number];

interface Submission {
  ids: number[];
  source: Source;
  ts: number;
  at: string;
}

/** Constant-time string compare to avoid leaking the token via timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function firstQueryValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Individual pokedexes are not public — require an admin token.
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    return res.status(503).json({ error: 'Admin access not configured' });
  }

  const authHeader = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization ?? '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
  const provided = bearer || firstQueryValue(req.query.token as string | string[] | undefined);
  if (!provided || !safeEqual(provided, adminToken)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // No source (or an unrecognised one) → return both lists; otherwise narrow to one.
  const sourceParam = firstQueryValue(req.query.source as string | string[] | undefined);
  const sources: Source[] =
    sourceParam === 'completion' || sourceParam === 'export'
      ? [sourceParam]
      : [...VALID_SOURCES];

  const rawLimit = parseInt(firstQueryValue(req.query.limit as string | string[] | undefined), 10);
  const rawOffset = parseInt(firstQueryValue(req.query.offset as string | string[] | undefined), 10);
  const limit = Math.min(Math.max(Number.isNaN(rawLimit) ? 100 : rawLimit, 1), 1000);
  const offset = Math.max(Number.isNaN(rawOffset) ? 0 : rawOffset, 0);

  try {
    type SourceResult = {
      total: number;
      offset: number;
      limit: number;
      submissions: Submission[];
      // All-time per-country counts (covers every submission ever received,
      // not just the retained list entries).
      countries: Record<string, number>;
    };
    const result: Partial<Record<Source, SourceResult>> = {};

    await Promise.all(
      sources.map(async (src) => {
        const key = `submissions:${src}`;
        const [total, rows, countries] = await Promise.all([
          redis.llen(key),
          // Newest first (LPUSH prepends), paginated.
          redis.lrange(key, offset, offset + limit - 1),
          redis.hgetall(`countries:${src}`) as Promise<Record<string, number> | null>,
        ]);

        // The @upstash/redis SDK auto-parses JSON entries on read, but fall back
        // to manual parse in case an entry comes back as a raw string.
        const submissions: Submission[] = (rows as unknown[]).map((row) => {
          if (typeof row === 'string') {
            try {
              return JSON.parse(row) as Submission;
            } catch {
              return { ids: [], source: src, ts: 0, at: '' };
            }
          }
          return row as Submission;
        });

        result[src] = { total, offset, limit, submissions, countries: countries ?? {} };
      }),
    );

    // Engagement milestone counters (total + by-country, no stored pokedexes).
    const milestones: Partial<Record<MilestoneSource, { total: number; countries: Record<string, number> }>> = {};
    await Promise.all(
      MILESTONE_SOURCES.map(async (src) => {
        const [total, countries] = await Promise.all([
          redis.get(`total:${src}`) as Promise<number | null>,
          redis.hgetall(`countries:${src}`) as Promise<Record<string, number> | null>,
        ]);
        milestones[src] = { total: total ?? 0, countries: countries ?? {} };
      }),
    );

    // Private data — never cache.
    res.setHeader('Cache-Control', 'no-store');

    return res.status(200).json({ ...result, milestones });
  } catch (err) {
    console.error('Submissions error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
