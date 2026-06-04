import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  redis,
  requireAdmin,
  firstQueryValue,
  POKEDEX_SOURCES,
  MILESTONE_SOURCES,
  isSource,
  type Source,
  type MilestoneSource,
} from './_shared.js';

interface Submission {
  id?: string;
  ids: number[];
  source: Source;
  ts: number;
  at: string;
}

interface SourceResult {
  // All-time count (the INCR counter); may exceed `stored` once past the cap.
  total: number;
  // Number of snapshots actually retained — drives "Load more" pagination.
  stored: number;
  offset: number;
  limit: number;
  submissions: Submission[];
  // All-time per-country counts (covers every submission ever received).
  countries: Record<string, number>;
}

/** Parse a stored list row. @upstash/redis usually auto-parses JSON, but fall
 *  back to a manual parse (tagged with the correct source) for raw strings. */
function parseRows(rows: unknown[], src: Source): Submission[] {
  return rows.map((row) => {
    if (typeof row === 'string') {
      try {
        return JSON.parse(row) as Submission;
      } catch {
        return { ids: [], source: src, ts: 0, at: '' };
      }
    }
    return row as Submission;
  });
}

async function fetchSource(src: Source, offset: number, limit: number): Promise<SourceResult> {
  const key = `submissions:${src}`;
  const [counter, stored, rows, countries] = await Promise.all([
    redis.get(`total:${src}`) as Promise<number | null>,
    redis.llen(key),
    // Newest first (LPUSH prepends), paginated.
    redis.lrange(key, offset, offset + limit - 1),
    redis.hgetall(`countries:${src}`) as Promise<Record<string, number> | null>,
  ]);
  return {
    // Legacy entries predate the INCR counter; fall back to the list length.
    total: counter ?? stored,
    stored,
    offset,
    limit,
    submissions: parseRows(rows as unknown[], src),
    countries: countries ?? {},
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Temporary diagnostic build marker so we can confirm which deploy is live.
  res.setHeader('x-p151-build', 'diag-1');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!(await requireAdmin(req, res))) return;

    // Narrow to one source when asked; otherwise return every source. Pokedex
    // sources come back at the top level, milestone sources under `milestones`.
    const sourceParam = firstQueryValue(req.query.source as string | string[] | undefined);
    const wanted = isSource(sourceParam) ? sourceParam : null;
    const pokedexSources = wanted ? POKEDEX_SOURCES.filter((s) => s === wanted) : [...POKEDEX_SOURCES];
    const milestoneSources = wanted
      ? MILESTONE_SOURCES.filter((s) => s === wanted)
      : [...MILESTONE_SOURCES];

    const rawLimit = parseInt(firstQueryValue(req.query.limit as string | string[] | undefined), 10);
    const rawOffset = parseInt(firstQueryValue(req.query.offset as string | string[] | undefined), 10);
    const limit = Math.min(Math.max(Number.isNaN(rawLimit) ? 100 : rawLimit, 1), 1000);
    const offset = Math.max(Number.isNaN(rawOffset) ? 0 : rawOffset, 0);

    // Fetch every requested source concurrently in a single batch.
    const entries = await Promise.all(
      [...pokedexSources, ...milestoneSources].map(
        async (src) => [src, await fetchSource(src, offset, limit)] as const,
      ),
    );
    const bySource = new Map<Source, SourceResult>(entries);

    const top: Partial<Record<Source, SourceResult>> = {};
    for (const src of pokedexSources) top[src] = bySource.get(src);
    const milestones: Partial<Record<MilestoneSource, SourceResult>> = {};
    for (const src of milestoneSources) milestones[src] = bySource.get(src);

    // Private data — never cache.
    res.setHeader('Cache-Control', 'no-store');

    return res.status(200).json({ ...top, milestones });
  } catch (err) {
    // Temporary verbose diagnostic — surfaces the real cause to the admin so we
    // can pinpoint the 500. To be reverted once resolved.
    console.error('Submissions error:', err);
    const e = err as Error;
    return res.status(500).json({
      error: 'Internal server error',
      debug: { name: e?.name, message: e?.message, at: e?.stack?.split('\n')[1]?.trim() },
    });
  }
}
