import { createSign } from 'node:crypto';

import type {
  SearchDailyPoint,
  SearchDimensionRow,
  SearchMetric,
  SearchPageQueryRow,
  SearchPerformanceSnapshot,
  SearchProviderKey,
  SearchProviderSnapshot,
} from '../src/lib/searchPerformance.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SEARCH_URL = 'https://www.googleapis.com/webmasters/v3/sites';
const GOOGLE_SEARCH_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const BING_API_URL = 'https://ssl.bing.com/webmaster/api.svc/json';
const REQUEST_TIMEOUT_MS = 15_000;
const DAY_MS = 86_400_000;

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

function googleRows(payload: unknown): GoogleRow[] {
  if (!payload || typeof payload !== 'object') return [];
  const rows = (payload as GoogleResponse).rows;
  return Array.isArray(rows) ? rows.filter((row): row is GoogleRow => !!row && typeof row === 'object') : [];
}

export function googleDailyRows(payload: unknown): SearchDailyPoint[] {
  return googleRows(payload)
    .map((row): SearchDailyPoint | null => {
      const date = typeof row.keys?.[0] === 'string' ? row.keys[0] : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      return { date, ...metricOf(row) };
    })
    .filter((row): row is SearchDailyPoint => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
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

export function bingDailyRows(payload: unknown): SearchDailyPoint[] {
  return bingRows(payload)
    .map((row): SearchDailyPoint | null => {
      const date = parseBingDate(row.Date);
      return date ? { date, ...metricOf(row) } : null;
    })
    .filter((row): row is SearchDailyPoint => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Collapse Bing's dated query/page rows to one impression-weighted row. */
export function bingDimensionRows(payload: unknown): SearchDimensionRow[] {
  const grouped = new Map<
    string,
    { clicks: number; impressions: number; weightedPosition: number; positionedImpressions: number }
  >();
  for (const row of bingRows(payload)) {
    const key = typeof row.Query === 'string' ? row.Query.trim() : '';
    if (!key) continue;
    const metric = metricOf(row);
    const current = grouped.get(key) ?? {
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
      positionedImpressions: 0,
    };
    current.clicks += metric.clicks;
    current.impressions += metric.impressions;
    if (metric.position != null && metric.impressions > 0) {
      current.weightedPosition += metric.position * metric.impressions;
      current.positionedImpressions += metric.impressions;
    }
    grouped.set(key, current);
  }
  return [...grouped.entries()]
    .map(([key, row]) => ({
      key,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
      position: row.positionedImpressions > 0 ? row.weightedPosition / row.positionedImpressions : null,
    }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, 25);
}

function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function todayUtcMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

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
    daily: [],
    pages: [],
    queries: [],
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

async function fetchGoogleQuery(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: readonly ('date' | 'page' | 'query')[],
): Promise<unknown> {
  return fetchJson(`${GOOGLE_SEARCH_URL}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions,
      rowLimit: dimensions.length === 1 && dimensions[0] === 'date' ? 1_000 : 250,
    }),
  });
}

export async function fetchGoogleSearchPerformance(): Promise<SearchProviderSnapshot> {
  const serviceAccountJson = process.env.GOOGLE_SEARCH_SERVICE_ACCOUNT_JSON?.trim();
  const clientId = process.env.GOOGLE_SEARCH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_SEARCH_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_SEARCH_REFRESH_TOKEN?.trim();
  const hasUserOAuth = !!clientId && !!clientSecret && !!refreshToken;
  if (!serviceAccountJson && !hasUserOAuth) return notConfigured('google');

  const siteUrl = process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL?.trim() || 'sc-domain:my151.app';
  // Search Console commonly settles after a short delay. Stop three days back
  // so a normal refresh does not present partial recent days as a traffic loss.
  const endMs = todayUtcMs() - 3 * DAY_MS;
  const endDate = utcDate(endMs);
  const startDate = utcDate(endMs - 89 * DAY_MS);
  const currentStart = utcDate(endMs - 27 * DAY_MS);
  const previousEnd = utcDate(endMs - 28 * DAY_MS);
  const previousStart = utcDate(endMs - 55 * DAY_MS);
  const accessToken = serviceAccountJson
    ? await googleServiceAccountAccessToken(serviceAccountJson)
    : await googleAccessToken(clientId!, clientSecret!, refreshToken!);
  const [dailyPayload, pagePayload, previousPagePayload, queryPayload, pageQueryPayload] = await Promise.all([
    fetchGoogleQuery(accessToken, siteUrl, startDate, endDate, ['date']),
    fetchGoogleQuery(accessToken, siteUrl, currentStart, endDate, ['page']),
    fetchGoogleQuery(accessToken, siteUrl, previousStart, previousEnd, ['page']),
    fetchGoogleQuery(accessToken, siteUrl, currentStart, endDate, ['query']),
    fetchGoogleQuery(accessToken, siteUrl, currentStart, endDate, ['page', 'query']),
  ]);

  return {
    provider: 'google',
    status: 'ready',
    fetchedAt: new Date().toISOString(),
    dataThrough: endDate,
    daily: googleDailyRows(dailyPayload),
    pages: googleDimensionRows(pagePayload),
    previousPages: googleDimensionRows(previousPagePayload),
    queries: googleDimensionRows(queryPayload),
    pageQueries: googlePageQueryRows(pageQueryPayload),
  };
}

async function fetchBingMethod(method: 'GetRankAndTrafficStats' | 'GetPageStats' | 'GetQueryStats', siteUrl: string, apiKey: string) {
  const url = new URL(`${BING_API_URL}/${method}`);
  url.searchParams.set('siteUrl', siteUrl);
  url.searchParams.set('apikey', apiKey);
  return fetchJson(url.toString());
}

export async function fetchBingSearchPerformance(): Promise<SearchProviderSnapshot> {
  const apiKey = process.env.BING_WEBMASTER_API_KEY?.trim();
  if (!apiKey) return notConfigured('bing');
  const siteUrl = process.env.BING_WEBMASTER_SITE_URL?.trim() || 'https://my151.app/';
  const [dailyPayload, pagePayload, queryPayload] = await Promise.all([
    fetchBingMethod('GetRankAndTrafficStats', siteUrl, apiKey),
    fetchBingMethod('GetPageStats', siteUrl, apiKey),
    fetchBingMethod('GetQueryStats', siteUrl, apiKey),
  ]);
  const allDaily = bingDailyRows(dailyPayload);
  const daily = allDaily.slice(-90);
  return {
    provider: 'bing',
    status: 'ready',
    fetchedAt: new Date().toISOString(),
    dataThrough: daily[daily.length - 1]?.date,
    message: 'Bing page and query detail may update less often than the daily totals.',
    daily,
    pages: bingDimensionRows(pagePayload),
    queries: bingDimensionRows(queryPayload),
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
  return { provider, status: 'error', message, daily: [], pages: [], queries: [] };
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

export async function buildSearchPerformanceSnapshot(
  previous?: SearchPerformanceSnapshot,
): Promise<SearchPerformanceSnapshot> {
  const [google, bing] = await Promise.all([
    settleProvider('google', fetchGoogleSearchPerformance, previous?.providers.google),
    settleProvider('bing', fetchBingSearchPerformance, previous?.providers.bing),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    providers: { google, bing },
  };
}
