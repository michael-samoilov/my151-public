import {
  SEARCH_RANGES,
  SEARCH_RANGE_SPECS,
  searchRangeWindows,
  type SearchDimensionRow,
  type SearchPageQueryRow,
  type SearchPerformanceSnapshot,
  type SearchProviderSnapshot,
  type SearchRangeDetail,
  type SearchRangeKey,
  type SearchSeriesPoint,
} from '@/lib/searchPerformance';
import { buildSearchPerformanceView } from '@/lib/searchPerformanceView';

const GENERATED_AT = '2026-09-24T02:00:00.000Z';

function sampleSeries(provider: 'google' | 'bing'): SearchSeriesPoint[] {
  const end = Date.UTC(2026, 8, 21);
  const impressions = provider === 'google'
    ? [10, 24, 30, 38, 42, 47, 52, 54, 48, 43, 39, 36, 31, 28, 40, 50, 60, 70, 88, 72, 65, 55, 45, 41]
    : [20, 25, 32, 39, 47, 57, 72, 90, 77, 62, 52, 47, 45, 39, 35, 32, 27, 22, 23, 25, 32, 42, 51, 61, 66, 56, 46, 34];
  const clicks = provider === 'google'
    ? [2, 5, 7, 8, 10, 11, 11, 11, 9, 8, 6, 7, 6, 6, 9, 12, 15, 17, 20, 15, 12, 10, 8, 7]
    : [2, 3, 5, 7, 7, 8, 9, 9, 7, 5, 5, 4, 5, 5, 5, 5, 4, 4, 3, 3, 3, 4, 4, 5, 6, 6, 6, 5];
  return impressions.map((value, index) => {
    const clickCount = clicks[index];
    return {
      start: new Date(end - (impressions.length - 1 - index) * 86_400_000).toISOString().slice(0, 10),
      impressions: value,
      clicks: clickCount,
      ctr: clickCount / value,
      position: provider === 'google' ? 6.3 : null,
    };
  });
}

/** Two days after the Google series that Search Console has not finalized. */
const sampleFresh: SearchSeriesPoint[] = [
  { start: '2026-09-22', clicks: 9, impressions: 47, ctr: 9 / 47, position: 6.1 },
  { start: '2026-09-23', clicks: 6, impressions: 33, ctr: 6 / 33, position: 6.4 },
];

function sampleHours(): SearchSeriesPoint[] {
  const end = Date.UTC(2026, 8, 23, 23);
  return Array.from({ length: 60 }, (_, index) => {
    const impressions = 1 + ((index * 7) % 5);
    const clicks = index % 3 === 0 ? 1 : 0;
    return {
      start: new Date(end - (59 - index) * 3_600_000).toISOString(),
      impressions,
      clicks,
      ctr: clicks / impressions,
      position: 5.8,
    };
  });
}

function scaled<T extends SearchDimensionRow | SearchPageQueryRow>(rows: T[], factor: number): T[] {
  return rows.map((row) => {
    const clicks = Math.round(row.clicks * factor);
    const impressions = Math.max(clicks, Math.round(row.impressions * factor));
    return { ...row, clicks, impressions, ctr: impressions > 0 ? clicks / impressions : 0 };
  });
}

function sampleProvider(
  provider: 'google' | 'bing',
  series: SearchSeriesPoint[],
  rows: { pages: SearchDimensionRow[]; queries: SearchDimensionRow[]; pageQueries: SearchPageQueryRow[] },
  ranges: readonly SearchRangeKey[],
): SearchProviderSnapshot {
  const dataThrough = series[series.length - 1].start;
  return {
    provider,
    status: 'ready',
    fetchedAt: GENERATED_AT,
    dataThrough,
    message: provider === 'bing' ? 'Bing page and query detail may update less often than the daily totals.' : undefined,
    series,
    ranges: Object.fromEntries(ranges.map((range) => {
      const { window, previous } = searchRangeWindows(range, dataThrough, series[0].start);
      const detail: SearchRangeDetail = {
        window,
        previous: previous ? { window: previous, pages: scaled(rows.pages, 0.8) } : undefined,
        ...rows,
      };
      return [range, detail];
    })),
  };
}

const DAY_RANGES = SEARCH_RANGES.filter((range) => SEARCH_RANGE_SPECS[range].granularity === 'day');

const googleRows = {
  pages: [
    { key: 'https://my151.app/', clicks: 200, impressions: 940, ctr: 200 / 940, position: 5.9 },
    { key: 'https://my151.app/custom-gym-leader', clicks: 31, impressions: 148, ctr: 31 / 148, position: 8.2 },
    { key: 'https://my151.app/pokedex-builder', clicks: 3, impressions: 56, ctr: 3 / 56, position: 10.8 },
    { key: 'https://my151.app/favorite-pokemon-picker', clicks: 4, impressions: 40, ctr: 4 / 40, position: 9.1 },
    { key: 'https://my151.app/favorite-pokemon-by-type', clicks: 1, impressions: 12, ctr: 1 / 12, position: 14.5 },
  ],
  queries: [
    { key: 'pokedex maker', clicks: 73, impressions: 320, ctr: 73 / 320, position: 5.4 },
    { key: 'pokedex builder', clicks: 29, impressions: 129, ctr: 29 / 129, position: 5.8 },
    { key: 'custom pokedex maker', clicks: 18, impressions: 75, ctr: 18 / 75, position: 4.9 },
    { key: 'pokédex maker', clicks: 9, impressions: 13, ctr: 9 / 13, position: 2.7 },
    { key: 'gym leader maker', clicks: 6, impressions: 18, ctr: 6 / 18, position: 7.2 },
  ],
  pageQueries: [
    { page: 'https://my151.app/', query: 'pokedex maker', clicks: 73, impressions: 320, ctr: 73 / 320, position: 5.4 },
    { page: 'https://my151.app/pokedex-builder', query: 'pokedex builder', clicks: 29, impressions: 129, ctr: 29 / 129, position: 5.8 },
    { page: 'https://my151.app/custom-gym-leader', query: 'gym leader maker', clicks: 6, impressions: 18, ctr: 6 / 18, position: 7.2 },
    { page: 'https://my151.app/favorite-pokemon-picker', query: 'favorite pokemon picker', clicks: 3, impressions: 22, ctr: 3 / 22, position: 8.4 },
    { page: 'https://my151.app/favorite-pokemon-by-type', query: 'favorite pokemon picker', clicks: 1, impressions: 6, ctr: 1 / 6, position: 13.0 },
  ],
};

const bingRows = {
  pages: [
    { key: 'https://my151.app/', clicks: 228, impressions: 1679, ctr: 228 / 1679, position: null },
    { key: 'https://my151.app/pokedex-builder', clicks: 7, impressions: 147, ctr: 7 / 147, position: null },
    { key: 'https://my151.app/custom-gym-leader', clicks: 1, impressions: 1, ctr: 1, position: null },
  ],
  queries: [
    { key: 'pokedex maker', clicks: 52, impressions: 286, ctr: 52 / 286, position: null },
    { key: 'make a pokedex', clicks: 9, impressions: 21, ctr: 9 / 21, position: null },
    { key: 'pokemon pokedex maker', clicks: 7, impressions: 27, ctr: 7 / 27, position: null },
    { key: 'my 151', clicks: 7, impressions: 10, ctr: 7 / 10, position: null },
    { key: 'my151 pokemon', clicks: 6, impressions: 10, ctr: 6 / 10, position: null },
  ],
  pageQueries: [],
};

const sampleSearchPerformance: SearchPerformanceSnapshot = {
  daily: {
    generatedAt: GENERATED_AT,
    providers: {
      google: { ...sampleProvider('google', sampleSeries('google'), googleRows, DAY_RANGES), fresh: sampleFresh },
      bing: sampleProvider('bing', sampleSeries('bing'), bingRows, DAY_RANGES),
    },
  },
  hourly: {
    generatedAt: GENERATED_AT,
    providers: {
      google: sampleProvider(
        'google',
        sampleHours(),
        {
          pages: scaled(googleRows.pages, 0.04),
          queries: scaled(googleRows.queries, 0.04),
          pageQueries: scaled(googleRows.pageQueries, 0.04),
        },
        ['24h'],
      ),
    },
  },
};

export const sampleSearchPerformanceView = buildSearchPerformanceView(sampleSearchPerformance);
