import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchPerformanceSnapshot, SearchProviderSnapshot, SearchProviderStatus } from './searchPerformance';

const { redisGet, rebuild } = vi.hoisted(() => ({
  redisGet: vi.fn(),
  rebuild: vi.fn(),
}));

vi.mock('../../api/_shared', () => ({
  redis: { get: redisGet, set: vi.fn(async () => 'OK') },
  requireAdmin: vi.fn(async () => true),
  firstQueryValue: (value: unknown) => (Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')),
}));
vi.mock('../../api/_searchPerformance', () => ({ buildSearchPerformanceSnapshot: rebuild }));

const { default: handler } = await import('../../api/search-performance');

const MINUTE = 60_000;

function provider(key: 'google' | 'bing', status: SearchProviderStatus): SearchProviderSnapshot {
  return { provider: key, status, daily: [], pages: [], queries: [] };
}

function snapshot(googleStatus: SearchProviderStatus, ageMs: number): SearchPerformanceSnapshot {
  return {
    generatedAt: new Date(Date.now() - ageMs).toISOString(),
    providers: { google: provider('google', googleStatus), bing: provider('bing', 'ready') },
  };
}

async function open(): Promise<void> {
  const res = {
    setHeader: vi.fn(),
    status: vi.fn(() => res),
    json: vi.fn(() => res),
  };
  await handler({ method: 'GET', query: {} } as unknown as VercelRequest, res as unknown as VercelResponse);
}

describe('search performance cache', () => {
  beforeEach(() => {
    rebuild.mockReset();
    rebuild.mockResolvedValue(snapshot('ready', 0));
  });

  it.each([
    { status: 'stale', ageMinutes: 20, rebuilt: true },
    { status: 'error', ageMinutes: 20, rebuilt: true },
    { status: 'stale', ageMinutes: 10, rebuilt: false },
    { status: 'ready', ageMinutes: 20 * 60, rebuilt: false },
  ] as const)('$status snapshot $ageMinutes minutes old is rebuilt: $rebuilt', async ({ status, ageMinutes, rebuilt }) => {
    redisGet.mockResolvedValue(snapshot(status, ageMinutes * MINUTE));
    await open();
    expect(rebuild).toHaveBeenCalledTimes(rebuilt ? 1 : 0);
  });
});
