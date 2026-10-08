// keeps: /api/search-performance builds this view on the server, and E2E stubs that route, so mixed engine rows or a leaked provider message would pass every spec.
import { describe, expect, it } from 'vitest';
import { buildSearchPerformanceView } from './searchPerformanceView';
import type {
  SearchPerformanceSnapshot,
  SearchProviderKey,
  SearchProviderSnapshot,
  SearchRangeDetail,
  SearchSeriesPoint,
} from './searchPerformance';

function dailyRows(start: string, impressions: number[]): SearchSeriesPoint[] {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  return impressions.map((value, index) => ({
    start: new Date(startMs + index * 86_400_000).toISOString().slice(0, 10),
    clicks: Math.round(value * 0.05),
    impressions: value,
    ctr: Math.round(value * 0.05) / value,
    position: 9,
  }));
}

function provider(key: SearchProviderKey, detail: Partial<SearchRangeDetail> = {}, message?: string): SearchProviderSnapshot {
  return {
    provider: key,
    status: 'ready',
    fetchedAt: '2026-09-23T12:00:00.000Z',
    dataThrough: '2026-09-20',
    message,
    series: dailyRows('2026-07-27', Array(56).fill(100)),
    ranges: {
      '28d': {
        window: { start: '2026-08-24', end: '2026-09-20' },
        previous: detail.previous,
        pages: detail.pages ?? [],
        queries: detail.queries ?? [],
        pageQueries: detail.pageQueries ?? [],
      },
    },
  };
}

function snapshot(google: SearchProviderSnapshot, bing: SearchProviderSnapshot = provider('bing')): SearchPerformanceSnapshot {
  return {
    daily: { generatedAt: '2026-09-23T12:00:00.000Z', providers: { google, bing } },
    hourly: { generatedAt: '2026-09-23T12:00:00.000Z', providers: { google: { ...google, series: [], ranges: {} } } },
  };
}

describe('search performance view', () => {
  it('groups every reported page and keeps engine metrics separate', () => {
    const page = 'https://my151.app/pokedex-builder';
    const other = 'https://my151.app/privacy';
    const view = buildSearchPerformanceView(snapshot(
      provider('google', {
        pages: [
          { key: page, clicks: 20, impressions: 500, ctr: 0.04, position: 8 },
          { key: other, clicks: 2, impressions: 50, ctr: 0.04, position: 12 },
        ],
        previous: {
          window: { start: '2026-07-27', end: '2026-08-23' },
          pages: [{ key: page, clicks: 10, impressions: 300, ctr: 0.03, position: 10 }],
        },
        pageQueries: [
          { page, query: 'pokemon builder', clicks: 12, impressions: 240, ctr: 0.05, position: 7 },
        ],
      }),
      provider('bing', { pages: [{ key: page, clicks: 3, impressions: 60, ctr: 0.05, position: 20 }] }),
    ));

    const { pages } = view.byRange['28d'];
    expect(pages.map((row) => row.path)).toEqual(['/pokedex-builder', '/privacy']);
    expect(pages[0].engines.google.current?.impressions).toBe(500);
    expect(pages[0].engines.bing.current?.impressions).toBe(60);
    expect(pages[0].engines.google.direction?.impressions).toBe(200);
    expect(pages[0].topQueries[0].query).toBe('pokemon builder');
  });

  it('projects provider data without raw provider messages or refresh controls', () => {
    const view = buildSearchPerformanceView(snapshot(provider(
      'google',
      { queries: [{ key: 'pokemon builder', clicks: 3, impressions: 40, ctr: 0.075, position: 6 }] },
      'upstream detail with a secret',
    )));
    const serialized = JSON.stringify(view);

    expect(serialized).not.toContain('upstream detail with a secret');
    expect(serialized).not.toContain('refresh');
    expect(view.byRange['28d'].providers.google.topQueries[0].key).toBe('pokemon builder');
  });
});
