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

export interface SearchDailyPoint extends SearchMetric {
  /** UTC date in YYYY-MM-DD form. */
  date: string;
}

export interface SearchDimensionRow extends SearchMetric {
  key: string;
}

export interface SearchPageQueryRow extends SearchMetric {
  page: string;
  query: string;
}

export interface SearchProviderSnapshot {
  provider: SearchProviderKey;
  status: SearchProviderStatus;
  fetchedAt?: string;
  dataThrough?: string;
  message?: string;
  daily: SearchDailyPoint[];
  pages: SearchDimensionRow[];
  /** Same-length period immediately before `pages`, when the provider supports it. */
  previousPages?: SearchDimensionRow[];
  queries: SearchDimensionRow[];
  /** Page-query pairs for the current detail period, when the provider supports them. */
  pageQueries?: SearchPageQueryRow[];
}

export interface SearchPerformanceSnapshot {
  generatedAt: string;
  providers: Record<SearchProviderKey, SearchProviderSnapshot>;
}

export const EMPTY_SEARCH_METRIC: SearchMetric = {
  clicks: 0,
  impressions: 0,
  ctr: 0,
  position: null,
};

/**
 * Sum a trailing calendar window. Position is impression-weighted so sparse
 * days cannot skew it as much as a simple average would.
 */
export function summarizeSearchWindow(daily: SearchDailyPoint[], days: number): SearchMetric {
  if (daily.length === 0 || days <= 0) return { ...EMPTY_SEARCH_METRIC };

  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  const latest = Date.parse(`${sorted[sorted.length - 1]?.date ?? ''}T00:00:00Z`);
  if (!Number.isFinite(latest)) return { ...EMPTY_SEARCH_METRIC };
  const cutoff = latest - (days - 1) * 86_400_000;
  const visible = sorted.filter((row) => {
    const ts = Date.parse(`${row.date}T00:00:00Z`);
    return Number.isFinite(ts) && ts >= cutoff && ts <= latest;
  });

  let clicks = 0;
  let impressions = 0;
  let positionedImpressions = 0;
  let weightedPosition = 0;
  for (const row of visible) {
    clicks += row.clicks;
    impressions += row.impressions;
    if (row.position != null && Number.isFinite(row.position) && row.impressions > 0) {
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

