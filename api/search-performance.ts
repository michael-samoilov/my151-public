import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildSearchIntelligenceView, type SearchReleaseContext } from '../src/lib/searchIntelligence.js';
import type { SearchPerformanceSnapshot } from '../src/lib/searchPerformance.js';
import { buildSearchPerformanceSnapshot } from './_searchPerformance.js';
import { firstQueryValue, redis, requireAdmin } from './_shared.js';

const CACHE_KEY = 'admin:search-performance:v1';
const CACHE_MAX_AGE_MS = 24 * 60 * 60_000;

function fresh(snapshot: SearchPerformanceSnapshot): boolean {
  const generatedAt = Date.parse(snapshot.generatedAt);
  return Number.isFinite(generatedAt) && Date.now() - generatedAt < CACHE_MAX_AGE_MS;
}

function releaseContext(): SearchReleaseContext {
  const environment = process.env.VERCEL_ENV?.trim() || 'local';
  const deploymentUrl = (
    environment === 'production'
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL
  )?.trim();
  return {
    environment,
    gitRef: process.env.VERCEL_GIT_COMMIT_REF?.trim() || undefined,
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim().slice(0, 8) || undefined,
    gitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE?.trim().split('\n')[0]?.slice(0, 120) || undefined,
    url: deploymentUrl || undefined,
    deploymentHistory: 'unavailable',
  };
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
    return res.status(200).json(buildSearchIntelligenceView(cached, releaseContext()));
  }

  const snapshot = await buildSearchPerformanceSnapshot(cached);
  try {
    await redis.set(CACHE_KEY, snapshot);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[search-performance] cache write failed: ${detail}`);
  }
  return res.status(200).json(buildSearchIntelligenceView(snapshot, releaseContext()));
}

