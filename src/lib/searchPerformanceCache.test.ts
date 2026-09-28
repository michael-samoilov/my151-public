import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchProviderKey, SearchProviderSnapshot, SearchProviderStatus, SearchSnapshotPart } from './searchPerformance';

const { redisMget, redisMset, rebuildDaily, rebuildHourly } = vi.hoisted(() => ({
  redisMget: vi.fn(),
  redisMset: vi.fn(async (_values: Record<string, unknown>) => 'OK'),
  rebuildDaily: vi.fn(),
  rebuildHourly: vi.fn(),
}));

vi.mock('../../api/_shared', () => ({
  redis: { mget: redisMget, mset: redisMset },
  requireAdmin: vi.fn(async () => true),
  firstQueryValue: (value: unknown) => (Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')),
}));
vi.mock('../../api/_searchPerformance', () => ({
  buildDailySearchSnapshot: rebuildDaily,
  buildHourlySearchSnapshot: rebuildHourly,
}));

const { default: handler } = await import('../../api/search-performance');

const MINUTE = 60_000;

function provider(key: SearchProviderKey, status: SearchProviderStatus): SearchProviderSnapshot {
  return { provider: key, status, series: [], ranges: {} };
}

function daily(ageMinutes: number, googleStatus: SearchProviderStatus = 'ready'): SearchSnapshotPart {
  return {
    generatedAt: new Date(Date.now() - ageMinutes * MINUTE).toISOString(),
    providers: { google: provider('google', googleStatus), bing: provider('bing', 'ready') },
  };
}

function hourly(ageMinutes: number, status: SearchProviderStatus = 'ready'): SearchSnapshotPart<'google'> {
  return {
    generatedAt: new Date(Date.now() - ageMinutes * MINUTE).toISOString(),
    providers: { google: provider('google', status) },
  };
}

async function open(query: { refresh?: string }): Promise<void> {
  const res = {
    setHeader: vi.fn(),
    status: vi.fn(() => res),
    json: vi.fn(() => res),
  };
  await handler({ method: 'GET', query } as unknown as VercelRequest, res as unknown as VercelResponse);
}

describe('search performance cache', () => {
  beforeEach(() => {
    redisMget.mockReset();
    redisMset.mockClear();
    rebuildDaily.mockReset();
    rebuildDaily.mockResolvedValue(daily(0));
    rebuildHourly.mockReset();
    rebuildHourly.mockResolvedValue(hourly(0));
  });

  it.each([
    { name: 'fresh parts', cached: [daily(20 * 60), hourly(50)], query: {}, rebuilt: [] },
    { name: 'a day-old daily part', cached: [daily(25 * 60), hourly(10)], query: {}, rebuilt: ['daily'] },
    { name: 'an hour-old hourly part', cached: [daily(10), hourly(61)], query: {}, rebuilt: ['hourly'] },
    { name: 'a stale provider after 20 minutes', cached: [daily(20, 'stale'), hourly(20, 'error')], query: {}, rebuilt: ['daily', 'hourly'] },
    { name: 'a stale provider after 10 minutes', cached: [daily(10, 'stale'), hourly(10, 'error')], query: {}, rebuilt: [] },
    { name: 'a forced refresh 10 minutes after the last', cached: [daily(10), hourly(10)], query: { refresh: '1' }, rebuilt: [] },
    { name: 'a forced refresh 20 minutes after the last', cached: [daily(20), hourly(20)], query: { refresh: '1' }, rebuilt: ['daily', 'hourly'] },
    { name: 'an empty cache', cached: [null, null], query: {}, rebuilt: ['daily', 'hourly'] },
  ])('$name rebuilds $rebuilt with one read and at most one write', async ({ cached, query, rebuilt }) => {
    redisMget.mockResolvedValue(cached);
    await open(query);
    expect(rebuildDaily).toHaveBeenCalledTimes(rebuilt.includes('daily') ? 1 : 0);
    expect(rebuildHourly).toHaveBeenCalledTimes(rebuilt.includes('hourly') ? 1 : 0);
    expect(redisMget).toHaveBeenCalledTimes(1);
    expect(redisMset).toHaveBeenCalledTimes(rebuilt.length > 0 ? 1 : 0);
    if (rebuilt.length > 0) {
      expect(Object.keys(redisMset.mock.calls[0][0] as object)).toEqual(
        rebuilt.map((part) => `admin:search-performance:v2:${part}`),
      );
    }
  });
});
