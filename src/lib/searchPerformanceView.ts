import {
  EMPTY_SEARCH_METRIC,
  SEARCH_RANGE_SPECS,
  bucketStarts,
  mapSearchRanges,
  sumSearchMetrics,
  type SearchDailyPoint,
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

const DAY_MS = 86_400_000;
const PAGE_LABELS: Record<string, string> = {
  '/': 'Homepage',
  '/pokedex-builder': 'Pokédex builder',
  '/custom-gym-leader': 'Gym leader maker',
};

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
  /** Null when the provider reported nothing for this range. */
  current: SearchWindowMetric | null;
  /** Null when the range does not compare, or the data does not reach back over the previous window. */
  comparison: SearchRangeComparison | null;
  /** Every bucket of the current window; a bucket the provider skipped reads as zero. */
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
  /** `periodDays`, `providers`, and `pages` are the 28d range for frontends deployed before `byRange`. */
  periodDays: 28;
  providers: Record<SearchProviderKey, SearchProviderView>;
  pages: SearchPagePerformance[];
  byRange: Record<SearchRangeKey, SearchRangeView>;
}

function dateAt(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function parsedDate(value: string): number | null {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function within(start: string, window: SearchDateRange): boolean {
  return start >= window.start && start <= window.end;
}

function metricForRange(rows: SearchDailyPoint[], start: number, end: number): SearchMetric {
  return sumSearchMetrics(rows.filter((row) => {
    const date = parsedDate(row.date);
    return date != null && date >= start && date <= end;
  }));
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
  const delta = deltaOf(currentMetric, previousMetric);
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
    delta: available ? delta : { ...delta, clicksPct: null, impressionsPct: null },
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
  return rows
    .filter((row) => pagePath(row.page) === path)
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks)
    .slice(0, 5)
    .map((row) => ({
      provider,
      query: row.query,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }));
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
  // A provider without this granularity (Bing has no hours) shows its daily status and no data.
  const google = part.google ?? snapshot.daily.providers.google;
  const bing = part.bing ?? snapshot.daily.providers.bing;
  const details = { google: part.google?.ranges[range], bing: part.bing?.ranges[range] };
  return {
    granularity,
    providers: {
      google: providerRangeView(google, details.google, granularity),
      bing: providerRangeView(bing, details.bing, granularity),
    },
    pages: buildPages(details),
  };
}

function legacyProviderView(source: SearchProviderSnapshot, range28: SearchProviderRangeView): SearchProviderView {
  const daily = source.series.map(({ start, ...metric }) => ({ date: start, ...metric }));
  return {
    provider: source.provider,
    status: source.status,
    fetchedAt: source.fetchedAt,
    dataThrough: source.dataThrough,
    daily,
    comparison: compareSearchPeriods(daily, 28),
    topQueries: range28.topQueries,
  };
}

export function buildSearchPerformanceView(snapshot: SearchPerformanceSnapshot): SearchPerformanceView {
  const byRange = mapSearchRanges((range) => rangeView(snapshot, range));
  const range28 = byRange['28d'];
  return {
    generatedAt: snapshot.daily.generatedAt,
    periodDays: 28,
    providers: {
      google: legacyProviderView(snapshot.daily.providers.google, range28.providers.google),
      bing: legacyProviderView(snapshot.daily.providers.bing, range28.providers.bing),
    },
    pages: range28.pages,
    byRange,
  };
}
