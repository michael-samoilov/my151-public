import { describe, expect, it } from 'vitest';
import {
  buildSearchIntelligenceView,
  compareSearchPeriods,
  type SearchReleaseContext,
} from './searchIntelligence';
import type {
  SearchDailyPoint,
  SearchPerformanceSnapshot,
  SearchProviderKey,
  SearchProviderSnapshot,
} from './searchPerformance';

const RELEASE: SearchReleaseContext = {
  environment: 'preview',
  gitRef: 'codex/search-intelligence',
  gitSha: 'abcdef12',
  gitMessage: 'feat(admin): add search intelligence',
  url: 'preview.example.test',
  deploymentHistory: 'unavailable',
};

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

describe('search intelligence', () => {
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

  it('gates low-volume page changes and recommends waiting', () => {
    const view = buildSearchIntelligenceView(snapshot(
      { pages: [{ key: 'https://my151.app/pokedex-builder', clicks: 0, impressions: 12, ctr: 0, position: 8 }] },
      { pages: [{ key: 'https://my151.app/pokedex-builder', clicks: 0, impressions: 4, ctr: 0, position: 30 }] },
    ), RELEASE);

    expect(view.focus.primary.kind).toBe('wait_for_data');
    expect(view.focus.secondary).toEqual([]);
  });

  it('ranks a material page decline ahead of secondary opportunities', () => {
    const view = buildSearchIntelligenceView(snapshot(
      {
        pages: [
          { key: 'https://my151.app/custom-gym-leader', clicks: 8, impressions: 180, ctr: 8 / 180, position: 10 },
          { key: 'https://my151.app/pokedex-builder', clicks: 5, impressions: 120, ctr: 5 / 120, position: 8 },
        ],
        previousPages: [
          { key: 'https://my151.app/custom-gym-leader', clicks: 20, impressions: 360, ctr: 20 / 360, position: 8 },
          { key: 'https://my151.app/pokedex-builder', clicks: 1, impressions: 40, ctr: 0.025, position: 14 },
        ],
      },
      { pages: [] },
    ), RELEASE);

    expect(view.focus.primary).toMatchObject({ kind: 'material_decline', page: '/custom-gym-leader' });
    expect(view.focus.secondary.some((item) => item.kind === 'search_engine_gap')).toBe(true);
  });

  it('does not treat ordinary lower Bing volume as a search-engine gap', () => {
    const page = 'https://my151.app/pokedex-builder';
    const view = buildSearchIntelligenceView(snapshot(
      { pages: [{ key: page, clicks: 20, impressions: 500, ctr: 0.04, position: 20 }] },
      { pages: [{ key: page, clicks: 3, impressions: 60, ctr: 0.05, position: 20 }] },
    ), RELEASE);

    expect(view.focus.primary.kind).toBe('wait_for_data');
    expect(view.focus.secondary).toEqual([]);
  });

  it('projects a reusable view without provider messages or refresh controls', () => {
    const view = buildSearchIntelligenceView(snapshot({ message: 'upstream detail with a secret' }), RELEASE);
    const serialized = JSON.stringify(view);

    expect(serialized).not.toContain('upstream detail with a secret');
    expect(serialized).not.toContain('refresh');
    expect(view.release).toEqual(RELEASE);
    expect(view.changeLog).toEqual({ mode: 'read_only', entries: [] });
    expect(view.conversionSignal).toBe('not_connected');
  });
});
