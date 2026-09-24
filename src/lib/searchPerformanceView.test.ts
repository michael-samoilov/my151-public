import { describe, expect, it } from 'vitest';
import {
  buildSearchPerformanceView,
  compareSearchPeriods,
} from './searchPerformanceView';
import type {
  SearchDailyPoint,
  SearchPerformanceSnapshot,
  SearchProviderKey,
  SearchProviderSnapshot,
} from './searchPerformance';

function dailyRows(start: string, impressions: number[]): SearchDailyPoint[] {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  return impressions.map((value, index) => ({
    date: new Date(startMs + index * 86_400_000).toISOString().slice(0, 10),
    clicks: Math.round(value * 0.05),
    impressions: value,
    ctr: Math.round(value * 0.05) / value,
    position: 9,
  }));
}

function provider(
  key: SearchProviderKey,
  overrides: Partial<SearchProviderSnapshot> = {},
): SearchProviderSnapshot {
  return {
    provider: key,
    status: 'ready',
    fetchedAt: '2026-09-23T12:00:00.000Z',
    dataThrough: '2026-09-20',
    daily: dailyRows('2026-07-27', Array(56).fill(100)),
    pages: [],
    queries: [],
    ...overrides,
  };
}

function snapshot(
  google: Partial<SearchProviderSnapshot> = {},
  bing: Partial<SearchProviderSnapshot> = {},
): SearchPerformanceSnapshot {
  return {
    generatedAt: '2026-09-23T12:00:00.000Z',
    providers: {
      google: provider('google', google),
      bing: provider('bing', bing),
    },
  };
}

describe('search performance view', () => {
  it('compares two complete, matched 28-day windows', () => {
    const comparison = compareSearchPeriods([
      ...dailyRows('2026-07-27', Array(28).fill(50)),
      ...dailyRows('2026-08-24', Array(28).fill(100)),
    ], 28);

    expect(comparison.available).toBe(true);
    expect(comparison.current.range).toEqual({ start: '2026-08-24', end: '2026-09-20' });
    expect(comparison.previous.range).toEqual({ start: '2026-07-27', end: '2026-08-23' });
    expect(comparison.delta.impressions).toBe(1_400);
    expect(comparison.delta.impressionsPct).toBe(1);
  });

  it('does not claim a comparison when the preceding window is incomplete', () => {
    const comparison = compareSearchPeriods(dailyRows('2026-09-01', Array(20).fill(100)), 28);

    expect(comparison.available).toBe(false);
    expect(comparison.delta.impressionsPct).toBeNull();
  });

  it('keeps empty providers free of invented dates', () => {
    const comparison = compareSearchPeriods([], 28);

    expect(comparison.available).toBe(false);
    expect(comparison.current.range).toEqual({ start: '', end: '' });
  });

  it('groups every reported page and keeps engine metrics separate', () => {
    const page = 'https://my151.app/pokedex-builder';
    const other = 'https://my151.app/privacy';
    const view = buildSearchPerformanceView(snapshot(
      {
        pages: [
          { key: page, clicks: 20, impressions: 500, ctr: 0.04, position: 8 },
          { key: other, clicks: 2, impressions: 50, ctr: 0.04, position: 12 },
        ],
        previousPages: [{ key: page, clicks: 10, impressions: 300, ctr: 0.03, position: 10 }],
        pageQueries: [
          { page, query: 'pokemon builder', clicks: 12, impressions: 240, ctr: 0.05, position: 7 },
        ],
      },
      { pages: [{ key: page, clicks: 3, impressions: 60, ctr: 0.05, position: 20 }] },
    ));

    expect(view.pages.map((row) => row.path)).toEqual(['/pokedex-builder', '/privacy']);
    expect(view.pages[0].engines.google.current?.impressions).toBe(500);
    expect(view.pages[0].engines.bing.current?.impressions).toBe(60);
    expect(view.pages[0].engines.google.direction?.impressions).toBe(200);
    expect(view.pages[0].topQueries[0].query).toBe('pokemon builder');
  });

  it('projects provider data without raw provider messages or refresh controls', () => {
    const view = buildSearchPerformanceView(snapshot({
      message: 'upstream detail with a secret',
      queries: [{ key: 'pokemon builder', clicks: 3, impressions: 40, ctr: 0.075, position: 6 }],
    }));
    const serialized = JSON.stringify(view);

    expect(serialized).not.toContain('upstream detail with a secret');
    expect(serialized).not.toContain('refresh');
    expect(view.providers.google.topQueries[0].key).toBe('pokemon builder');
    expect(view.providers.google.daily).toHaveLength(56);
  });
});
