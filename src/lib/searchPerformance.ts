export type SearchProviderKey = 'google' | 'bing';

export type SearchProviderStatus = 'ready' | 'stale' | 'not_configured' | 'error';

export interface SearchMetric {
  clicks: number;
  impressions: number;
  /** Fraction from 0 to 1. */
  ctr: number;
  /** Average search position, or null when the provider did not supply one. */
  position: number | null;
}

export interface SearchDimensionRow extends SearchMetric {
  key: string;
}

export interface SearchPageQueryRow extends SearchMetric {
  page: string;
  query: string;
}

export type SearchGranularity = 'day' | 'hour';

export const SEARCH_RANGES = ['24h', '7d', '28d', '90d', '180d', '365d', 'all'] as const;
export type SearchRangeKey = (typeof SEARCH_RANGES)[number];

/** A range spans a fixed number of buckets, or every reported bucket. */
type SearchRangeSpec =
  | { granularity: SearchGranularity; buckets: number; compare: boolean }
  | { granularity: 'day'; buckets: 'all' };

/**
 * Search Console keeps hourly data for 10 days and daily data for 16 months,
 * so 365d has no full year before it to compare with.
 */
export const SEARCH_RANGE_SPECS: Record<SearchRangeKey, SearchRangeSpec> = {
  '24h': { granularity: 'hour', buckets: 24, compare: true },
  '7d': { granularity: 'day', buckets: 7, compare: true },
  '28d': { granularity: 'day', buckets: 28, compare: true },
  '90d': { granularity: 'day', buckets: 90, compare: true },
  '180d': { granularity: 'day', buckets: 180, compare: true },
  '365d': { granularity: 'day', buckets: 365, compare: false },
  all: { granularity: 'day', buckets: 'all' },
};

export function mapSearchRanges<T>(build: (range: SearchRangeKey) => T): Record<SearchRangeKey, T> {
  return Object.fromEntries(SEARCH_RANGES.map((range) => [range, build(range)])) as Record<SearchRangeKey, T>;
}

/** Both ends are bucket starts inside the range. */
export interface SearchDateRange {
  start: string;
  end: string;
}

export interface SearchSeriesPoint extends SearchMetric {
  /** `YYYY-MM-DD` for a day bucket, a UTC ISO instant for an hour bucket. */
  start: string;
}

/** Pages and queries one provider reported inside one range's window. */
export interface SearchRangeDetail {
  window: SearchDateRange;
  /** The same span right before `window`, for ranges that compare. */
  previous?: { window: SearchDateRange; pages: SearchDimensionRow[] };
  pages: SearchDimensionRow[];
  queries: SearchDimensionRow[];
  pageQueries: SearchPageQueryRow[];
}

export interface SearchProviderSnapshot {
  provider: SearchProviderKey;
  status: SearchProviderStatus;
  fetchedAt?: string;
  /** The last bucket the provider reported. Every window ends here. */
  dataThrough?: string;
  message?: string;
  series: SearchSeriesPoint[];
  /** Ranges of this snapshot's granularity. A missing range has no data. */
  ranges: Partial<Record<SearchRangeKey, SearchRangeDetail>>;
}

/** One stored Redis value. The daily and hourly parts refresh on their own clocks. */
export interface SearchSnapshotPart<P extends SearchProviderKey = SearchProviderKey> {
  generatedAt: string;
  providers: Record<P, SearchProviderSnapshot>;
}

export interface SearchPerformanceSnapshot {
  daily: SearchSnapshotPart;
  /** Bing reports no hours. */
  hourly: SearchSnapshotPart<'google'>;
}

export const EMPTY_SEARCH_METRIC: SearchMetric = {
  clicks: 0,
  impressions: 0,
  ctr: 0,
  position: null,
};

/** Position is impression-weighted, so sparse rows skew it less than a simple average would. */
export function sumSearchMetrics(rows: readonly SearchMetric[]): SearchMetric {
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

const BUCKET_MS: Record<SearchGranularity, number> = { day: 86_400_000, hour: 3_600_000 };

function bucketMs(start: string, granularity: SearchGranularity): number {
  return Date.parse(granularity === 'day' ? `${start}T00:00:00Z` : start);
}

/** The start of the bucket that holds `ms`. */
export function bucketStart(ms: number, granularity: SearchGranularity): string {
  const iso = new Date(ms - (ms % BUCKET_MS[granularity])).toISOString();
  return granularity === 'day' ? iso.slice(0, 10) : iso;
}

/** Every bucket start from `range.start` to `range.end`, inclusive. */
export function bucketStarts(range: SearchDateRange, granularity: SearchGranularity): string[] {
  const step = BUCKET_MS[granularity];
  const end = bucketMs(range.end, granularity);
  const starts: string[] = [];
  for (let ms = bucketMs(range.start, granularity); ms <= end; ms += step) starts.push(bucketStart(ms, granularity));
  return starts;
}

/**
 * The window a range covers, ending at the `anchor` bucket, and the same span
 * right before it when the range compares. `all` starts at `earliest`.
 */
export function searchRangeWindows(
  range: SearchRangeKey,
  anchor: string,
  earliest: string,
): { window: SearchDateRange; previous: SearchDateRange | null } {
  const spec = SEARCH_RANGE_SPECS[range];
  if (spec.buckets === 'all') return { window: { start: earliest, end: anchor }, previous: null };
  const step = BUCKET_MS[spec.granularity];
  const start = bucketMs(anchor, spec.granularity) - (spec.buckets - 1) * step;
  const window = { start: bucketStart(start, spec.granularity), end: anchor };
  if (!spec.compare) return { window, previous: null };
  const previousEnd = start - step;
  return {
    window,
    previous: {
      start: bucketStart(previousEnd - (spec.buckets - 1) * step, spec.granularity),
      end: bucketStart(previousEnd, spec.granularity),
    },
  };
}
