import { createSign } from 'node:crypto';

import {
  SEARCH_RANGES,
  SEARCH_RANGE_SPECS,
  bucketStart,
  searchRangeWindows,
  sumSearchMetrics,
  type SearchDateRange,
  type SearchDimensionRow,
  type SearchGranularity,
  type SearchMetric,
  type SearchPageQueryRow,
  type SearchPerformanceSnapshot,
  type SearchProviderKey,
  type SearchProviderSnapshot,
  type SearchRangeDetail,
  type SearchSeriesPoint,
  type SearchSnapshotPart,
} from '../src/lib/searchPerformance.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SEARCH_URL = 'https://www.googleapis.com/webmasters/v3/sites';
const GOOGLE_SEARCH_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const BING_API_URL = 'https://ssl.bing.com/webmaster/api.svc/json';
const REQUEST_TIMEOUT_MS = 15_000;
const DAY_MS = 86_400_000;
const SEARCH_CONSOLE_MONTHS = 16;
/** Two 24-hour windows, even when the latest reported hour lags a day behind. */
const HOURLY_FETCH_DAYS = 4;
const BING_TOP_ROWS = 25;
const DAY_RANGES = SEARCH_RANGES.filter((range) => SEARCH_RANGE_SPECS[range].granularity === 'day');

interface GoogleRow {
  keys?: unknown[];
  clicks?: unknown;
  impressions?: unknown;
  ctr?: unknown;
  position?: unknown;
}

interface GoogleResponse {
  rows?: unknown;
}

interface BingRow {
  Date?: unknown;
  Clicks?: unknown;
  Impressions?: unknown;
  AvgClickPosition?: unknown;
  AvgImpressionPosition?: unknown;
  Query?: unknown;
}

/** A provider row inside one bucket, grouped by `keys` (a page, a query, or both). */
export interface SearchBucketRow extends SearchSeriesPoint {
  keys: string[];
}

function finiteNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function metricOf(row: GoogleRow | BingRow): SearchMetric {
  const google = row as GoogleRow;
  const bing = row as BingRow;
  const clicks = Math.max(0, finiteNumber(google.clicks ?? bing.Clicks));
  const impressions = Math.max(0, finiteNumber(google.impressions ?? bing.Impressions));
  const suppliedCtr = finiteNumber(google.ctr);
  const rawPosition =
    google.position ?? bing.AvgImpressionPosition ?? bing.AvgClickPosition;
  const position = finiteNumber(rawPosition);
  return {
    clicks,
    impressions,
    ctr: suppliedCtr > 0 ? suppliedCtr : impressions > 0 ? clicks / impressions : 0,
    position: position > 0 ? position : null,
  };
}

/** A Search Console date or hour key as a bucket start, or null when it is neither. */
function parseBucket(value: unknown, granularity: SearchGranularity): string | null {
  if (typeof value !== 'string') return null;
  if (granularity === 'day') return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  const ms = /^\d{4}-\d{2}-\d{2}T\d{2}/.test(value) ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? bucketStart(ms, 'hour') : null;
}

function googleRows(payload: unknown): GoogleRow[] {
  if (!payload || typeof payload !== 'object') return [];
  const rows = (payload as GoogleResponse).rows;
  return Array.isArray(rows) ? rows.filter((row): row is GoogleRow => !!row && typeof row === 'object') : [];
}

function trimmedKeys(keys: unknown[]): string[] | null {
  const trimmed = keys.map((key) => (typeof key === 'string' ? key.trim() : ''));
  return trimmed.every(Boolean) ? trimmed : null;
}

/** Rows grouped by a leading date or hour dimension, oldest first. */
export function googleBucketRows(payload: unknown, granularity: SearchGranularity): SearchBucketRow[] {
  return googleRows(payload)
    .map((row): SearchBucketRow | null => {
      const start = parseBucket(row.keys?.[0], granularity);
      const keys = trimmedKeys(row.keys?.slice(1) ?? []);
      return start && keys ? { start, keys, ...metricOf(row) } : null;
    })
    .filter((row): row is SearchBucketRow => row !== null)
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function googleDimensionRows(payload: unknown): SearchDimensionRow[] {
  return googleRows(payload)
    .map((row): SearchDimensionRow | null => {
      const key = typeof row.keys?.[0] === 'string' ? row.keys[0].trim() : '';
      return key ? { key, ...metricOf(row) } : null;
    })
    .filter((row): row is SearchDimensionRow => row !== null);
}

export function googlePageQueryRows(payload: unknown): SearchPageQueryRow[] {
  return googleRows(payload)
    .map((row): SearchPageQueryRow | null => {
      const page = typeof row.keys?.[0] === 'string' ? row.keys[0].trim() : '';
      const query = typeof row.keys?.[1] === 'string' ? row.keys[1].trim() : '';
      return page && query ? { page, query, ...metricOf(row) } : null;
    })
    .filter((row): row is SearchPageQueryRow => row !== null);
}

function bingRows(payload: unknown): BingRow[] {
  if (!payload || typeof payload !== 'object') return [];
  const wrapped = (payload as { d?: unknown }).d;
  const rows = Array.isArray(wrapped) ? wrapped : Array.isArray(payload) ? payload : [];
  return rows.filter((row): row is BingRow => !!row && typeof row === 'object');
}

export function parseBingDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const dotNet = /\/Date\((-?\d+)(?:[+-]\d+)?\)\//.exec(value);
  const ts = dotNet ? Number(dotNet[1]) : Date.parse(value);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString().slice(0, 10);
}

/** Bing's dated rows, oldest first. Page and query rows carry their key in `Query`. */
export function bingBucketRows(payload: unknown): SearchBucketRow[] {
  return bingRows(payload)
    .map((row): SearchBucketRow | null => {
      const start = parseBingDate(row.Date);
      const key = typeof row.Query === 'string' ? row.Query.trim() : '';
      return start ? { start, keys: key ? [key] : [], ...metricOf(row) } : null;
    })
    .filter((row): row is SearchBucketRow => row !== null)
    .sort((a, b) => a.start.localeCompare(b.start));
}

function seriesOf(rows: SearchBucketRow[]): SearchSeriesPoint[] {
  return rows.filter((row) => row.keys.length === 0).map(({ keys: _keys, ...point }) => point);
}

/** Sum the rows inside `window` into one row per key, most clicks first. */
export function rollUp(rows: SearchBucketRow[], window: SearchDateRange): (SearchMetric & { keys: string[] })[] {
  const groups = new Map<string, { keys: string[]; rows: SearchMetric[] }>();
  for (const row of rows) {
    if (row.keys.length === 0 || row.start < window.start || row.start > window.end) continue;
    const id = JSON.stringify(row.keys);
    const group = groups.get(id) ?? { keys: row.keys, rows: [] };
    group.rows.push(row);
    groups.set(id, group);
  }
  return [...groups.values()]
    .map(({ keys, rows: grouped }) => ({ keys, ...sumSearchMetrics(grouped) }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}

function asDimension({ keys, ...metric }: SearchMetric & { keys: string[] }): SearchDimensionRow {
  return { key: keys[0], ...metric };
}

function asPageQuery({ keys, ...metric }: SearchMetric & { keys: string[] }): SearchPageQueryRow {
  return { page: keys[0], query: keys[1], ...metric };
}

function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function todayUtcMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** Search Console reads startDate and endDate as Pacific dates. */
const PACIFIC_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Search provider returned HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** Build the signed JWT assertion used by Google's service-account OAuth flow. */
export function createGoogleServiceAccountAssertion(
  clientEmail: string,
  privateKey: string,
  issuedAtSeconds = Math.floor(Date.now() / 1_000),
): string {
  const encodedHeader = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
  const encodedClaims = base64UrlJson({
    iss: clientEmail,
    scope: GOOGLE_SEARCH_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + 3_600,
  });
  const unsigned = `${encodedHeader}.${encodedClaims}`;
  const signature = createSign('RSA-SHA256').update(unsigned).end().sign(privateKey).toString('base64url');
  return `${unsigned}.${signature}`;
}

async function tokenFromGoogle(body: URLSearchParams): Promise<string> {
  const payload = await fetchJson(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const token = payload && typeof payload === 'object' ? (payload as { access_token?: unknown }).access_token : undefined;
  if (typeof token !== 'string' || !token) throw new Error('Google did not return an access token');
  return token;
}

function notConfigured(provider: SearchProviderKey): SearchProviderSnapshot {
  return {
    provider,
    status: 'not_configured',
    message: provider === 'google' ? 'Google Search Console is not connected.' : 'Bing Webmaster Tools is not connected.',
    series: [],
    ranges: {},
  };
}

async function googleAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  return tokenFromGoogle(new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }));
}

async function googleServiceAccountAccessToken(credentialsJson: string): Promise<string> {
  let credentials: unknown;
  try {
    credentials = JSON.parse(credentialsJson);
  } catch {
    throw new Error('Google service-account credentials are not valid JSON');
  }
  if (!credentials || typeof credentials !== 'object') {
    throw new Error('Google service-account credentials are incomplete');
  }
  const { client_email: clientEmail, private_key: privateKey } = credentials as {
    client_email?: unknown;
    private_key?: unknown;
  };
  if (typeof clientEmail !== 'string' || !clientEmail || typeof privateKey !== 'string' || !privateKey) {
    throw new Error('Google service-account credentials are incomplete');
  }
  const assertion = createGoogleServiceAccountAssertion(clientEmail, privateKey);
  return tokenFromGoogle(new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  }));
}

type GoogleDimension = 'date' | 'hour' | 'page' | 'query';

interface GoogleQueryBody {
  startDate: string;
  endDate: string;
  dimensions: GoogleDimension[];
  rowLimit: number;
  dataState?: 'hourly_all';
}

type GoogleQuery = (body: GoogleQueryBody) => Promise<unknown>;

/** Null when no Google credentials are set. */
async function connectGoogle(): Promise<GoogleQuery | null> {
  const serviceAccountJson = process.env.GOOGLE_SEARCH_SERVICE_ACCOUNT_JSON?.trim();
  const clientId = process.env.GOOGLE_SEARCH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_SEARCH_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_SEARCH_REFRESH_TOKEN?.trim();
  const hasUserOAuth = !!clientId && !!clientSecret && !!refreshToken;
  if (!serviceAccountJson && !hasUserOAuth) return null;

  const siteUrl = process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL?.trim() || 'sc-domain:my151.app';
  const accessToken = serviceAccountJson
    ? await googleServiceAccountAccessToken(serviceAccountJson)
    : await googleAccessToken(clientId!, clientSecret!, refreshToken!);
  return (body) =>
    fetchJson(`${GOOGLE_SEARCH_URL}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
}

/** Daily ranges: the date series, then pages and queries for each window. */
export async function fetchGoogleDaily(): Promise<SearchProviderSnapshot> {
  const query = await connectGoogle();
  if (!query) return notConfigured('google');
  const today = todayUtcMs();
  // Search Console commonly settles after a short delay. Stop three days back
  // so a normal refresh does not present partial recent days as a traffic loss.
  const dataThrough = utcDate(today - 3 * DAY_MS);
  const now = new Date(today);
  const retainedFrom = utcDate(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - SEARCH_CONSOLE_MONTHS, now.getUTCDate()));
  const series = seriesOf(googleBucketRows(
    await query({ startDate: retainedFrom, endDate: dataThrough, dimensions: ['date'], rowLimit: 1_000 }),
    'day',
  ));
  const inWindow = (window: SearchDateRange, dimensions: GoogleDimension[]) =>
    query({ startDate: window.start, endDate: window.end, dimensions, rowLimit: 250 });
  const ranges = await Promise.all(DAY_RANGES.map(async (range) => {
    const { window, previous } = searchRangeWindows(range, dataThrough, series[0]?.start ?? retainedFrom);
    const [pages, queries, pageQueries, previousDetail] = await Promise.all([
      inWindow(window, ['page']).then(googleDimensionRows),
      inWindow(window, ['query']).then(googleDimensionRows),
      inWindow(window, ['page', 'query']).then(googlePageQueryRows),
      previous
        ? inWindow(previous, ['page']).then((payload) => ({ window: previous, pages: googleDimensionRows(payload) }))
        : undefined,
    ]);
    const detail: SearchRangeDetail = { window, previous: previousDetail, pages, queries, pageQueries };
    return [range, detail] as const;
  }));
  return {
    provider: 'google',
    status: 'ready',
    fetchedAt: new Date().toISOString(),
    dataThrough,
    series,
    ranges: Object.fromEntries(ranges),
  };
}

/** The 24h range: hourly totals, pages, and queries, summed per window. */
export async function fetchGoogleHourly(): Promise<SearchProviderSnapshot> {
  const query = await connectGoogle();
  if (!query) return notConfigured('google');
  const now = Date.now();
  const hours = async (dimensions: GoogleDimension[]) => googleBucketRows(
    await query({
      startDate: PACIFIC_DATE.format(now - (HOURLY_FETCH_DAYS - 1) * DAY_MS),
      endDate: PACIFIC_DATE.format(now),
      dimensions: ['hour', ...dimensions],
      dataState: 'hourly_all',
      rowLimit: 25_000,
    }),
    'hour',
  );
  const [totals, pages, queries, pageQueries] = await Promise.all([
    hours([]),
    hours(['page']),
    hours(['query']),
    hours(['page', 'query']),
  ]);
  const series = seriesOf(totals);
  const dataThrough = series[series.length - 1]?.start;
  const snapshot: SearchProviderSnapshot = {
    provider: 'google',
    status: 'ready',
    fetchedAt: new Date().toISOString(),
    dataThrough,
    series,
    ranges: {},
  };
  if (!dataThrough) return snapshot;
  const { window, previous } = searchRangeWindows('24h', dataThrough, series[0].start);
  snapshot.ranges['24h'] = {
    window,
    previous: previous ? { window: previous, pages: rollUp(pages, previous).map(asDimension) } : undefined,
    pages: rollUp(pages, window).map(asDimension),
    queries: rollUp(queries, window).map(asDimension),
    pageQueries: rollUp(pageQueries, window).map(asPageQuery),
  };
  return snapshot;
}

async function fetchBingMethod(method: 'GetRankAndTrafficStats' | 'GetPageStats' | 'GetQueryStats', siteUrl: string, apiKey: string) {
  const url = new URL(`${BING_API_URL}/${method}`);
  url.searchParams.set('siteUrl', siteUrl);
  url.searchParams.set('apikey', apiKey);
  return fetchJson(url.toString());
}

/** Bing reports days only. Its page and query rows are filtered to each window by their date. */
export async function fetchBingSearchPerformance(): Promise<SearchProviderSnapshot> {
  const apiKey = process.env.BING_WEBMASTER_API_KEY?.trim();
  if (!apiKey) return notConfigured('bing');
  const siteUrl = process.env.BING_WEBMASTER_SITE_URL?.trim() || 'https://my151.app/';
  const [dailyPayload, pagePayload, queryPayload] = await Promise.all([
    fetchBingMethod('GetRankAndTrafficStats', siteUrl, apiKey),
    fetchBingMethod('GetPageStats', siteUrl, apiKey),
    fetchBingMethod('GetQueryStats', siteUrl, apiKey),
  ]);
  const series = seriesOf(bingBucketRows(dailyPayload));
  const dataThrough = series[series.length - 1]?.start;
  const pages = bingBucketRows(pagePayload);
  const queries = bingBucketRows(queryPayload);
  const top = (rows: SearchBucketRow[], window: SearchDateRange) =>
    rollUp(rows, window).slice(0, BING_TOP_ROWS).map(asDimension);
  return {
    provider: 'bing',
    status: 'ready',
    fetchedAt: new Date().toISOString(),
    dataThrough,
    message: 'Bing page and query detail may update less often than the daily totals.',
    series,
    ranges: dataThrough
      ? Object.fromEntries(DAY_RANGES.map((range) => {
          const { window, previous } = searchRangeWindows(range, dataThrough, series[0].start);
          const detail: SearchRangeDetail = {
            window,
            previous: previous ? { window: previous, pages: top(pages, previous) } : undefined,
            pages: top(pages, window),
            queries: top(queries, window),
            pageQueries: [],
          };
          return [range, detail];
        }))
      : {},
  };
}

function failedProvider(
  provider: SearchProviderKey,
  previous: SearchProviderSnapshot | undefined,
): SearchProviderSnapshot {
  const message = `${provider === 'google' ? 'Google Search Console' : 'Bing Webmaster Tools'} could not refresh.`;
  if (previous && (previous.status === 'ready' || previous.status === 'stale')) {
    return { ...previous, status: 'stale', message: `${message} Showing the last successful snapshot.` };
  }
  return { provider, status: 'error', message, series: [], ranges: {} };
}

async function settleProvider(
  provider: SearchProviderKey,
  fetcher: () => Promise<SearchProviderSnapshot>,
  previous: SearchProviderSnapshot | undefined,
): Promise<SearchProviderSnapshot> {
  try {
    return await fetcher();
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[search-performance] ${provider} refresh failed: ${detail}`);
    return failedProvider(provider, previous);
  }
}

export async function buildDailySearchSnapshot(
  previous?: SearchPerformanceSnapshot['daily'],
): Promise<SearchPerformanceSnapshot['daily']> {
  const [google, bing] = await Promise.all([
    settleProvider('google', fetchGoogleDaily, previous?.providers.google),
    settleProvider('bing', fetchBingSearchPerformance, previous?.providers.bing),
  ]);
  return { generatedAt: new Date().toISOString(), providers: { google, bing } };
}

export async function buildHourlySearchSnapshot(
  previous?: SearchSnapshotPart<'google'>,
): Promise<SearchSnapshotPart<'google'>> {
  const google = await settleProvider('google', fetchGoogleHourly, previous?.providers.google);
  return { generatedAt: new Date().toISOString(), providers: { google } };
}
