import {
  EMPTY_SEARCH_METRIC,
  type SearchDailyPoint,
  type SearchDimensionRow,
  type SearchMetric,
  type SearchPerformanceSnapshot,
  type SearchProviderKey,
  type SearchProviderSnapshot,
  type SearchProviderStatus,
} from './searchPerformance.js';

const DAY_MS = 86_400_000;
const PAGE_LABELS: Record<string, string> = {
  '/': 'Homepage',
  '/pokedex-builder': 'Pokédex builder',
  '/custom-gym-leader': 'Gym leader maker',
};

export interface SearchDateRange {
  start: string;
  end: string;
}

export interface SearchWindowSummary {
  range: SearchDateRange;
  metric: SearchMetric;
}

export interface SearchPeriodDelta {
  clicks: number;
  clicksPct: number | null;
  impressions: number;
  impressionsPct: number | null;
  ctrPoints: number;
  position: number | null;
}

export interface SearchPeriodComparison {
  days: number;
  available: boolean;
  current: SearchWindowSummary;
  previous: SearchWindowSummary;
  delta: SearchPeriodDelta;
}

export interface SearchProviderView {
  provider: SearchProviderKey;
  status: SearchProviderStatus;
  fetchedAt?: string;
  dataThrough?: string;
  daily: SearchDailyPoint[];
  comparison: SearchPeriodComparison;
  topQueries: SearchDimensionRow[];
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

export interface SearchPerformanceView {
  generatedAt: string;
  periodDays: 28;
  providers: Record<SearchProviderKey, SearchProviderView>;
  pages: SearchPagePerformance[];
}

function dateAt(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function parsedDate(value: string): number | null {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function metricForRange(rows: SearchDailyPoint[], start: number, end: number): SearchMetric {
  let clicks = 0;
  let impressions = 0;
  let positionedImpressions = 0;
  let weightedPosition = 0;
  for (const row of rows) {
    const date = parsedDate(row.date);
    if (date == null || date < start || date > end) continue;
    clicks += row.clicks;
    impressions += row.impressions;
    if (row.position != null && row.impressions > 0) {
      positionedImpressions += row.impressions;
      weightedPosition += row.position * row.impressions;
    }
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: positionedImpressions > 0 ? weightedPosition / positionedImpressions : null,
  };
}

function percentDelta(current: number, previous: number, available: boolean, minimum: number): number | null {
  if (!available || previous < minimum) return null;
  return (current - previous) / previous;
}

export function compareSearchPeriods(daily: SearchDailyPoint[], days = 28): SearchPeriodComparison {
  const dates = daily
    .map((row) => parsedDate(row.date))
    .filter((date): date is number => date != null)
    .sort((a, b) => a - b);
  const latest = dates[dates.length - 1] ?? 0;
  if (!latest) {
    return {
      days,
      available: false,
      current: { range: { start: '', end: '' }, metric: { ...EMPTY_SEARCH_METRIC } },
      previous: { range: { start: '', end: '' }, metric: { ...EMPTY_SEARCH_METRIC } },
      delta: {
        clicks: 0,
        clicksPct: null,
        impressions: 0,
        impressionsPct: null,
        ctrPoints: 0,
        position: null,
      },
    };
  }
  const currentStart = latest - (days - 1) * DAY_MS;
  const previousEnd = currentStart - DAY_MS;
  const previousStart = previousEnd - (days - 1) * DAY_MS;
  const currentMetric = metricForRange(daily, currentStart, latest);
  const previousMetric = metricForRange(daily, previousStart, previousEnd);
  const available = (dates[0] ?? Infinity) <= previousStart;
  return {
    days,
    available,
    current: {
      range: { start: dateAt(currentStart), end: dateAt(latest) },
      metric: currentMetric,
    },
    previous: {
      range: { start: dateAt(previousStart), end: dateAt(previousEnd) },
      metric: previousMetric,
    },
    delta: {
      clicks: currentMetric.clicks - previousMetric.clicks,
      clicksPct: percentDelta(currentMetric.clicks, previousMetric.clicks, available, 5),
      impressions: currentMetric.impressions - previousMetric.impressions,
      impressionsPct: percentDelta(currentMetric.impressions, previousMetric.impressions, available, 20),
      ctrPoints: currentMetric.ctr - previousMetric.ctr,
      position:
        currentMetric.position != null && previousMetric.position != null
          ? currentMetric.position - previousMetric.position
          : null,
    },
  };
}

function pagePath(value: string): string | null {
  try {
    const url = new URL(value, 'https://my151.app');
    return url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : '/';
  } catch {
    return null;
  }
}

function combineMetrics(rows: SearchMetric[]): SearchMetric | null {
  if (rows.length === 0) return null;
  let clicks = 0;
  let impressions = 0;
  let positionedImpressions = 0;
  let weightedPosition = 0;
  for (const row of rows) {
    clicks += row.clicks;
    impressions += row.impressions;
    if (row.position != null && row.impressions > 0) {
      positionedImpressions += row.impressions;
      weightedPosition += row.position * row.impressions;
    }
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: positionedImpressions > 0 ? weightedPosition / positionedImpressions : null,
  };
}

function pagesByPath(rows: SearchDimensionRow[]): Map<string, SearchMetric> {
  const grouped = new Map<string, SearchMetric[]>();
  for (const row of rows) {
    const path = pagePath(row.key);
    if (!path) continue;
    grouped.set(path, [...(grouped.get(path) ?? []), row]);
  }
  return new Map(
    [...grouped.entries()].flatMap(([path, metrics]) => {
      const combined = combineMetrics(metrics);
      return combined ? [[path, combined]] : [];
    }),
  );
}

function engineView(
  current: SearchMetric | undefined,
  previous: SearchMetric | undefined,
): SearchPageEngineView {
  const direction = current && previous
    ? {
        impressions: current.impressions - previous.impressions,
        impressionsPct: percentDelta(current.impressions, previous.impressions, true, 20),
      }
    : null;
  return { current: current ?? null, previous: previous ?? null, direction };
}

function pageQueries(provider: SearchProviderSnapshot, path: string): SearchPageQueryView[] {
  return (provider.pageQueries ?? [])
    .filter((row) => pagePath(row.page) === path)
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks)
    .slice(0, 5)
    .map((row) => ({
      provider: provider.provider,
      query: row.query,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }));
}

function buildPages(snapshot: SearchPerformanceSnapshot): SearchPagePerformance[] {
  const current = {
    google: pagesByPath(snapshot.providers.google.pages),
    bing: pagesByPath(snapshot.providers.bing.pages),
  };
  const previous = {
    google: pagesByPath(snapshot.providers.google.previousPages ?? []),
    bing: pagesByPath(snapshot.providers.bing.previousPages ?? []),
  };
  const paths = new Set([...current.google.keys(), ...current.bing.keys()]);
  return [...paths]
    .map((path) => {
      const google = current.google.get(path);
      const bing = current.bing.get(path);
      return {
        path,
        label: PAGE_LABELS[path] ?? path,
        engines: {
          google: engineView(google, previous.google.get(path)),
          bing: engineView(bing, previous.bing.get(path)),
        },
        topQueries: [
          ...pageQueries(snapshot.providers.google, path),
          ...pageQueries(snapshot.providers.bing, path),
        ],
      } satisfies SearchPagePerformance;
    })
    .sort((a, b) => {
      const bImpressions = (b.engines.google.current?.impressions ?? 0) + (b.engines.bing.current?.impressions ?? 0);
      const aImpressions = (a.engines.google.current?.impressions ?? 0) + (a.engines.bing.current?.impressions ?? 0);
      return bImpressions - aImpressions || a.path.localeCompare(b.path);
    });
}

function providerView(provider: SearchProviderSnapshot): SearchProviderView {
  return {
    provider: provider.provider,
    status: provider.status,
    fetchedAt: provider.fetchedAt,
    dataThrough: provider.dataThrough,
    daily: provider.daily.map((row) => ({ ...row })),
    comparison: compareSearchPeriods(provider.daily, 28),
    topQueries: provider.queries
      .slice()
      .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks)
      .slice(0, 10)
      .map((row) => ({ ...row })),
  };
}

export function buildSearchPerformanceView(snapshot: SearchPerformanceSnapshot): SearchPerformanceView {
  return {
    generatedAt: snapshot.generatedAt,
    periodDays: 28,
    providers: {
      google: providerView(snapshot.providers.google),
      bing: providerView(snapshot.providers.bing),
    },
    pages: buildPages(snapshot),
  };
}
