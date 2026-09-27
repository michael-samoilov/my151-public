import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildSearchPerformanceView } from '../src/lib/searchPerformanceView.js';
import type { SearchPerformanceSnapshot, SearchProviderStatus } from '../src/lib/searchPerformance.js';
import { buildSearchPerformanceSnapshot } from './_searchPerformance.js';
import { firstQueryValue, redis, requireAdmin } from './_shared.js';

const CACHE_KEY = 'admin:search-performance:v1';

// A failed provider expires the snapshot sooner, so the next open retries it.
const MAX_AGE_MS: Record<SearchProviderStatus, number> = {
  ready: 24 * 60 * 60_000,
  not_configured: 24 * 60 * 60_000,
  stale: 15 * 60_000,
  error: 15 * 60_000,
};

function fresh(snapshot: SearchPerformanceSnapshot): boolean {
  const generatedAt = Date.parse(snapshot.generatedAt);
  const maxAge = Math.min(...Object.values(snapshot.providers).map((provider) => MAX_AGE_MS[provider.status]));
  return Number.isFinite(generatedAt) && Date.now() - generatedAt < maxAge;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!(await requireAdmin(req, res))) return;

  res.setHeader('Cache-Control', 'no-store');
  let cached: SearchPerformanceSnapshot | undefined;
  try {
    cached = (await redis.get<SearchPerformanceSnapshot>(CACHE_KEY)) ?? undefined;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[search-performance] cache read failed: ${detail}`);
  }

  const force = ['1', 'true'].includes(firstQueryValue(req.query.refresh).toLowerCase());
  if (!force && cached && fresh(cached)) {
    return res.status(200).json(buildSearchPerformanceView(cached));
  }

  const snapshot = await buildSearchPerformanceSnapshot(cached);
  try {
    await redis.set(CACHE_KEY, snapshot);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[search-performance] cache write failed: ${detail}`);
  }
  return res.status(200).json(buildSearchPerformanceView(snapshot));
}

