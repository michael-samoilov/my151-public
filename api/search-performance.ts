import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildSearchPerformanceView } from '../src/lib/searchPerformanceView.js';
import type { SearchPerformanceSnapshot, SearchSnapshotPart } from '../src/lib/searchPerformance.js';
import { buildDailySearchSnapshot, buildHourlySearchSnapshot } from './_searchPerformance.js';
import { firstQueryValue, redis, requireAdmin } from './_shared.js';

// The v1 key stays untouched, so a rolled-back deploy still finds its own snapshot.
const DAILY_KEY = 'admin:search-performance:v2:daily';
const HOURLY_KEY = 'admin:search-performance:v2:hourly';

const MINUTE_MS = 60_000;
const READY_MAX_AGE_MS = { daily: 24 * 60 * MINUTE_MS, hourly: 60 * MINUTE_MS };
// A failed provider expires its part sooner, so the next open retries it. A
// forced refresh (opening the Search tab) refetches no part younger than this.
const RETRY_MS = 15 * MINUTE_MS;

type Daily = SearchPerformanceSnapshot['daily'];
type Hourly = SearchPerformanceSnapshot['hourly'];

function fresh(part: keyof typeof READY_MAX_AGE_MS, snapshot: SearchSnapshotPart<'google'> | null, force: boolean): boolean {
  if (!snapshot) return false;
  const age = Date.now() - Date.parse(snapshot.generatedAt);
  const failed = Object.values(snapshot.providers).some(
    (provider) => provider.status === 'stale' || provider.status === 'error',
  );
  return Number.isFinite(age) && age < (force || failed ? RETRY_MS : READY_MAX_AGE_MS[part]);
}

function logFailure(step: string, error: unknown) {
  const detail = error instanceof Error ? error.message : 'Unknown error';
  console.error(`[search-performance] ${step} failed: ${detail}`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!(await requireAdmin(req, res))) return;

  res.setHeader('Cache-Control', 'no-store');
  let cached: [Daily | null, Hourly | null] = [null, null];
  try {
    cached = await redis.mget<[Daily | null, Hourly | null]>(DAILY_KEY, HOURLY_KEY);
  } catch (error) {
    logFailure('cache read', error);
  }
  const [cachedDaily, cachedHourly] = cached;

  const force = ['1', 'true'].includes(firstQueryValue(req.query.refresh).toLowerCase());
  const keepDaily = fresh('daily', cachedDaily, force) ? cachedDaily : null;
  const keepHourly = fresh('hourly', cachedHourly, force) ? cachedHourly : null;
  const [daily, hourly] = await Promise.all([
    keepDaily ?? buildDailySearchSnapshot(cachedDaily ?? undefined),
    keepHourly ?? buildHourlySearchSnapshot(cachedHourly ?? undefined),
  ]);
  const writes = {
    ...(keepDaily ? {} : { [DAILY_KEY]: daily }),
    ...(keepHourly ? {} : { [HOURLY_KEY]: hourly }),
  };
  if (Object.keys(writes).length > 0) {
    try {
      await redis.mset(writes);
    } catch (error) {
      logFailure('cache write', error);
    }
  }
  return res.status(200).json(buildSearchPerformanceView({ daily, hourly }));
}
