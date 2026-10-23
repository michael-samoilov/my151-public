import {
  EMPTY_SEARCH_METRIC,
  SEARCH_RANGE_SPECS,
  bucketStarts,
  mapSearchRanges,
  sumSearchMetrics,
  type SearchDateRange,
  type SearchDimensionRow,
  type SearchGranularity,
  type SearchMetric,
  type SearchPageQueryRow,
  type SearchPerformanceSnapshot,
  type SearchProviderKey,
  type SearchProviderSnapshot,
  type SearchProviderStatus,
  type SearchRangeDetail,
  type SearchRangeKey,
  type SearchSeriesPoint,
} from './searchPerformance.js';

const PAGE_LABELS: Record<string, string> = {
  '/': 'Homepage',
  '/pokedex-builder': 'Pokédex builder',
  '/custom-gym-leader': 'Gym leader maker',
  '/favorite-pokemon-picker': 'Favorite Pokémon Picker',
};

const PAGE_REDIRECTS: Record<string, string> = {
  '/favorite-pokemon-by-type': '/favorite-pokemon-picker',
  '/favorite-pokemon-by-type.html': '/favorite-pokemon-picker',
};

export interface SearchPeriodDelta {
  clicks: number;
  clicksPct: number | null;
  impressions: number;
  impressionsPct: number | null;
  ctrPoints: number;
  position: number | null;
}

export interface SearchPageEngineView {
  current: SearchMetric | null;
  previous: SearchMetric | null;
  direction: {
    impressions: number;
    impressionsPct: number | null;
  } | null;
}

export interface SearchPageQueryView extends SearchMetric {
  provider: SearchProviderKey;
  query: string;
}

export interface SearchPagePerformance {
  path: string;
  label: string;
  engines: Record<SearchProviderKey, SearchPageEngineView>;
  topQueries: SearchPageQueryView[];
}

export interface SearchWindowMetric {
  window: SearchDateRange;
  metric: SearchMetric;
}

export interface SearchRangeComparison {
  previous: SearchWindowMetric;
  delta: SearchPeriodDelta;
}

export interface SearchProviderRangeView {
  provider: SearchProviderKey;
  status: SearchProviderStatus;
  fetchedAt?: string;
  dataThrough?: string;
  current: SearchWindowMetric | null;
  comparison: SearchRangeComparison | null;
  series: SearchSeriesPoint[];
  topQueries: SearchDimensionRow[];
}

export interface SearchRangeView {
  granularity: SearchGranularity;
  providers: Record<SearchProviderKey, SearchProviderRangeView>;
  pages: SearchPagePerformance[];
}

export interface SearchPerformanceView {
  generatedAt: string;
  byRange: Record<SearchRangeKey, SearchRangeView>;
}

function within(start: string, window: SearchDateRange): boolean {
  return start >= window.start && start <= window.end;
}

function percentDelta(current: number, previous: number, minimum: number): number | null {
  if (previous < minimum) return null;
  return (current - previous) / previous;
}

function deltaOf(current: SearchMetric, previous: SearchMetric): SearchPeriodDelta {
  return {
    clicks: current.clicks - previous.clicks,
    clicksPct: percentDelta(current.clicks, previous.clicks, 5),
    impressions: current.impressions - previous.impressions,
    impressionsPct: percentDelta(current.impressions, previous.impressions, 20),
    ctrPoints: current.ctr - previous.ctr,
    position: current.position != null && previous.position != null ? current.position - previous.position : null,
  };
}

function pagePath(value: string): string | null {
  try {
    const url = new URL(value, 'https://my151.app');
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : '/';
    return PAGE_REDIRECTS[path] ?? path;
  } catch {
    return null;
  }
}

function pagesByPath(rows: SearchDimensionRow[]): Map<string, SearchMetric> {
  const grouped = new Map<string, SearchMetric[]>();
  for (const row of rows) {
    const path = pagePath(row.key);
    if (!path) continue;
    grouped.set(path, [...(grouped.get(path) ?? []), row]);
  }
  return new Map([...grouped.entries()].map(([path, metrics]) => [path, sumSearchMetrics(metrics)]));
}

function engineView(
  current: SearchMetric | undefined,
  previous: SearchMetric | undefined,
): SearchPageEngineView {
  const direction = current && previous
    ? {
        impressions: current.impressions - previous.impressions,
        impressionsPct: percentDelta(current.impressions, previous.impressions, 20),
      }
    : null;
  return { current: current ?? null, previous: previous ?? null, direction };
}

function pageQueries(provider: SearchProviderKey, rows: SearchPageQueryRow[], path: string): SearchPageQueryView[] {
  const byQuery = new Map<string, SearchMetric[]>();
  for (const row of rows) {
    if (pagePath(row.page) === path) byQuery.set(row.query, [...(byQuery.get(row.query) ?? []), row]);
  }
  return [...byQuery.entries()]
    .map(([query, metrics]) => ({ provider, query, ...sumSearchMetrics(metrics) }))
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks)
    .slice(0, 5);
}

function buildPages(details: Record<SearchProviderKey, SearchRangeDetail | undefined>): SearchPagePerformance[] {
  const current = {
    google: pagesByPath(details.google?.pages ?? []),
    bing: pagesByPath(details.bing?.pages ?? []),
  };
  const previous = {
    google: pagesByPath(details.google?.previous?.pages ?? []),
    bing: pagesByPath(details.bing?.previous?.pages ?? []),
  };
  const paths = new Set([...current.google.keys(), ...current.bing.keys()]);
  return [...paths]
    .map((path) => ({
      path,
      label: PAGE_LABELS[path] ?? path,
      engines: {
        google: engineView(current.google.get(path), previous.google.get(path)),
        bing: engineView(current.bing.get(path), previous.bing.get(path)),
      },
      topQueries: [
        ...pageQueries('google', details.google?.pageQueries ?? [], path),
        ...pageQueries('bing', details.bing?.pageQueries ?? [], path),
      ],
    }) satisfies SearchPagePerformance)
    .sort((a, b) => {
      const bImpressions = (b.engines.google.current?.impressions ?? 0) + (b.engines.bing.current?.impressions ?? 0);
      const aImpressions = (a.engines.google.current?.impressions ?? 0) + (a.engines.bing.current?.impressions ?? 0);
      return bImpressions - aImpressions || a.path.localeCompare(b.path);
    });
}

function topQueries(rows: SearchDimensionRow[]): SearchDimensionRow[] {
  return rows
    .slice()
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks)
    .slice(0, 10)
    .map((row) => ({ ...row }));
}

function providerRangeView(
  source: SearchProviderSnapshot,
  detail: SearchRangeDetail | undefined,
  granularity: SearchGranularity,
): SearchProviderRangeView {
  const base = {
    provider: source.provider,
    status: source.status,
    fetchedAt: source.fetchedAt,
    dataThrough: source.dataThrough,
  };
  if (!detail) return { ...base, current: null, comparison: null, series: [], topQueries: [] };
  const reported = new Map(source.series.map((point) => [point.start, point]));
  const series = bucketStarts(detail.window, granularity).map(
    (start) => reported.get(start) ?? { start, ...EMPTY_SEARCH_METRIC },
  );
  const metric = sumSearchMetrics(series);
  const previousWindow = detail.previous?.window;
  const first = source.series[0]?.start;
  const covered = previousWindow && first != null && first <= previousWindow.start;
  const previousMetric = covered
    ? sumSearchMetrics(source.series.filter((point) => within(point.start, previousWindow)))
    : null;
  return {
    ...base,
    current: { window: detail.window, metric },
    comparison: previousWindow && previousMetric
      ? { previous: { window: previousWindow, metric: previousMetric }, delta: deltaOf(metric, previousMetric) }
      : null,
    series,
    topQueries: topQueries(detail.queries),
  };
}

function rangeView(snapshot: SearchPerformanceSnapshot, range: SearchRangeKey): SearchRangeView {
  const { granularity } = SEARCH_RANGE_SPECS[range];
  const part: Partial<Record<SearchProviderKey, SearchProviderSnapshot>> =
    granularity === 'hour' ? snapshot.hourly.providers : snapshot.daily.providers;
  const google = part.google ?? snapshot.daily.providers.google;
  const bing = part.bing ?? snapshot.daily.providers.bing;
  const details = { google: part.google?.ranges[range], bing: part.bing?.ranges[range] };
  const providers = {
    google: providerRangeView(google, details.google, granularity),
    bing: providerRangeView(bing, details.bing, granularity),
  };
  const compared = (key: SearchProviderKey) => {
    const detail = details[key];
    return detail && !providers[key].comparison ? { ...detail, previous: undefined } : detail;
  };
  return {
    granularity,
    providers,
    pages: buildPages({ google: compared('google'), bing: compared('bing') }),
  };
}

export function buildSearchPerformanceView(snapshot: SearchPerformanceSnapshot): SearchPerformanceView {
  return {
    generatedAt: snapshot.daily.generatedAt,
    byRange: mapSearchRanges((range) => rangeView(snapshot, range)),
  };
}
