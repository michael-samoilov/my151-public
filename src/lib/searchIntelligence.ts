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
const PAGE_ACTION_IMPRESSIONS = 50;
const CANONICAL_PAGES = [
  { path: '/', label: 'Homepage' },
  { path: '/pokedex-builder', label: 'Pokédex builder' },
  { path: '/custom-gym-leader', label: 'Gym leader maker' },
] as const;

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

export interface SearchProviderIntelligence {
  provider: SearchProviderKey;
  status: SearchProviderStatus;
  fetchedAt?: string;
  dataThrough?: string;
  comparison: SearchPeriodComparison;
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

export interface SearchPageIntelligence {
  path: string;
  label: string;
  clicks: number;
  impressions: number;
  engines: Record<SearchProviderKey, SearchPageEngineView>;
  topQueries: SearchPageQueryView[];
}

export type SearchRecommendationKind =
  | 'material_decline'
  | 'emerging_page'
  | 'search_engine_gap'
  | 'snippet_opportunity'
  | 'striking_distance'
  | 'wait_for_data';

export interface SearchRecommendation {
  kind: SearchRecommendationKind;
  page: string | null;
  title: string;
  action: string;
  evidence: string[];
}

export interface SearchReleaseContext {
  environment: string;
  gitRef?: string;
  gitSha?: string;
  gitMessage?: string;
  url?: string;
  deploymentHistory: 'unavailable';
}

export interface SeoChangeLogEntry {
  id: string;
  page: string;
  shippedAt: string;
  change: string;
  hypothesis: string;
  baseline: SearchDateRange;
  outcome?: {
    assessedAt: string;
    result: string;
  };
}

export interface SearchIntelligenceView {
  generatedAt: string;
  periodDays: 28;
  providers: Record<SearchProviderKey, SearchProviderIntelligence>;
  pages: SearchPageIntelligence[];
  focus: {
    primary: SearchRecommendation;
    secondary: SearchRecommendation[];
  };
  release: SearchReleaseContext;
  conversionSignal: 'not_connected';
  changeLog: {
    mode: 'read_only';
    entries: SeoChangeLogEntry[];
  };
}

interface RankedRecommendation extends SearchRecommendation {
  score: number;
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
  const currentMetric = latest ? metricForRange(daily, currentStart, latest) : { ...EMPTY_SEARCH_METRIC };
  const previousMetric = latest ? metricForRange(daily, previousStart, previousEnd) : { ...EMPTY_SEARCH_METRIC };
  const available = dates.length > 0 && (dates[0] ?? Infinity) <= previousStart;
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
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : '/';
    return CANONICAL_PAGES.some((page) => page.path === path) ? path : null;
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
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, 3)
    .map((row) => ({
      provider: provider.provider,
      query: row.query,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }));
}

function buildPages(snapshot: SearchPerformanceSnapshot): SearchPageIntelligence[] {
  const current = {
    google: pagesByPath(snapshot.providers.google.pages),
    bing: pagesByPath(snapshot.providers.bing.pages),
  };
  const previous = {
    google: pagesByPath(snapshot.providers.google.previousPages ?? []),
    bing: pagesByPath(snapshot.providers.bing.previousPages ?? []),
  };
  return CANONICAL_PAGES.map(({ path, label }) => {
    const google = current.google.get(path);
    const bing = current.bing.get(path);
    return {
      path,
      label,
      clicks: (google?.clicks ?? 0) + (bing?.clicks ?? 0),
      impressions: (google?.impressions ?? 0) + (bing?.impressions ?? 0),
      engines: {
        google: engineView(google, previous.google.get(path)),
        bing: engineView(bing, previous.bing.get(path)),
      },
      topQueries: [
        ...pageQueries(snapshot.providers.google, path),
        ...pageQueries(snapshot.providers.bing, path),
      ].slice(0, 3),
    };
  });
}

function providerName(provider: SearchProviderKey): string {
  return provider === 'google' ? 'Google' : 'Bing';
}

function displayNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

function expectedCtr(position: number): number {
  if (position <= 3) return 0.08;
  if (position <= 6) return 0.05;
  if (position <= 10) return 0.03;
  return 0.015;
}

function rankedRecommendations(
  pages: SearchPageIntelligence[],
  providers: Record<SearchProviderKey, SearchProviderIntelligence>,
): RankedRecommendation[] {
  const candidates: RankedRecommendation[] = [];
  for (const page of pages) {
    for (const provider of ['google', 'bing'] as const) {
      const engine = page.engines[provider];
      const current = engine.current;
      const previous = engine.previous;
      if (!current || current.impressions < PAGE_ACTION_IMPRESSIONS) continue;
      const name = providerName(provider);
      if (previous && previous.impressions >= 80) {
        const change = current.impressions - previous.impressions;
        const material = Math.max(30, previous.impressions * 0.25);
        if (change <= -material) {
          candidates.push({
            kind: 'material_decline',
            page: page.path,
            title: `Investigate the drop before changing ${page.path}`,
            action: 'Check indexability and intent fit, then draft one scoped change for approval.',
            evidence: [
              `${name} impressions fell by ${displayNumber(Math.abs(change))}, from ${displayNumber(previous.impressions)} to ${displayNumber(current.impressions)}.`,
              'This clears both the 30-impression and 25% decline gates.',
            ],
            score: 1_000 + Math.min(400, Math.abs(change)),
          });
        } else if (change >= Math.max(30, previous.impressions * 0.5)) {
          candidates.push({
            kind: 'emerging_page',
            page: page.path,
            title: `Protect the emerging demand on ${page.path}`,
            action: 'Review its next step and internal links, then log one approved improvement.',
            evidence: [
              `${name} impressions rose by ${displayNumber(change)}, from ${displayNumber(previous.impressions)} to ${displayNumber(current.impressions)}.`,
              'The increase clears the 30-impression and 50% growth gates.',
            ],
            score: 800 + Math.min(300, change),
          });
        }
      }
      if (current.position != null && current.position >= 4 && current.position <= 15) {
        candidates.push({
          kind: 'striking_distance',
          page: page.path,
          title: `${page.path} is within striking distance`,
          action: 'Compare its title and opening copy with the top reported queries, then draft one change for approval.',
          evidence: [
            `${name} position is ${current.position.toFixed(1)} across ${displayNumber(current.impressions)} impressions.`,
            'The heuristic requires position 4–15 and at least 50 impressions.',
          ],
          score: 400 + Math.min(200, current.impressions / 2),
        });
      }
      if (
        current.position != null &&
        current.position <= 15 &&
        current.impressions >= 75 &&
        current.ctr < expectedCtr(current.position) * 0.65
      ) {
        candidates.push({
          kind: 'snippet_opportunity',
          page: page.path,
          title: `${page.path} earns impressions but few clicks`,
          action: 'Review the search title and snippet against query intent, then draft one change for approval.',
          evidence: [
            `${name} CTR is ${(current.ctr * 100).toFixed(1)}% at position ${current.position.toFixed(1)} across ${displayNumber(current.impressions)} impressions.`,
            'This is a heuristic opportunity, not a causal finding.',
          ],
          score: 500 + Math.min(200, current.impressions / 2),
        });
      }
    }

    if (
      ['ready', 'stale'].includes(providers.google.status) &&
      ['ready', 'stale'].includes(providers.bing.status)
    ) {
      const google = page.engines.google.current?.impressions ?? 0;
      const bing = page.engines.bing.current?.impressions ?? 0;
      const stronger = Math.max(google, bing);
      const weaker = Math.min(google, bing);
      if (stronger >= PAGE_ACTION_IMPRESSIONS && weaker <= 10) {
        const weakProvider = google < bing ? 'Google' : 'Bing';
        candidates.push({
          kind: 'search_engine_gap',
          page: page.path,
          title: `${page.path} has a search-engine gap`,
          action: `Check ${weakProvider} indexing and canonical signals before changing page copy.`,
          evidence: [
            `Google reports ${displayNumber(google)} impressions; Bing reports ${displayNumber(bing)}.`,
            'The weaker ready engine reports no more than 10 impressions.',
          ],
          score: 600 + Math.min(200, stronger - weaker),
        });
      }
    }
  }

  const seenPages = new Set<string>();
  return candidates
    .sort((a, b) => b.score - a.score)
    .filter((candidate) => {
      if (!candidate.page || seenPages.has(candidate.page)) return false;
      seenPages.add(candidate.page);
      return true;
    })
    .slice(0, 4);
}

function buildFocus(
  pages: SearchPageIntelligence[],
  providers: Record<SearchProviderKey, SearchProviderIntelligence>,
): SearchIntelligenceView['focus'] {
  const ranked = rankedRecommendations(pages, providers);
  if (ranked.length > 0) {
    const [{ score: _primaryScore, ...primary }, ...rest] = ranked;
    return {
      primary,
      secondary: rest.slice(0, 3).map(({ score: _score, ...item }) => item),
    };
  }
  const comparisonsReady = Object.values(providers).some((provider) => provider.comparison.available);
  return {
    primary: {
      kind: 'wait_for_data',
      page: null,
      title: 'Hold. There is not enough evidence for a page change.',
      action: 'Wait for another complete reporting window; do not edit a page yet.',
      evidence: [
        `No page cleared the ${PAGE_ACTION_IMPRESSIONS}-impression action gate.`,
        comparisonsReady
          ? 'No material page movement cleared the absolute-change gates.'
          : 'A complete preceding 28-day window is not available.',
      ],
    },
    secondary: [],
  };
}

function providerView(provider: SearchProviderSnapshot): SearchProviderIntelligence {
  return {
    provider: provider.provider,
    status: provider.status,
    fetchedAt: provider.fetchedAt,
    dataThrough: provider.dataThrough,
    comparison: compareSearchPeriods(provider.daily, 28),
  };
}

export function buildSearchIntelligenceView(
  snapshot: SearchPerformanceSnapshot,
  release: SearchReleaseContext,
): SearchIntelligenceView {
  const providers = {
    google: providerView(snapshot.providers.google),
    bing: providerView(snapshot.providers.bing),
  };
  const pages = buildPages(snapshot);
  return {
    generatedAt: snapshot.generatedAt,
    periodDays: 28,
    providers,
    pages,
    focus: buildFocus(pages, providers),
    release,
    conversionSignal: 'not_connected',
    changeLog: { mode: 'read_only', entries: [] },
  };
}
