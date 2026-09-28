import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildDailySearchSnapshot, buildHourlySearchSnapshot } from '../../api/_searchPerformance';
import { SEARCH_RANGES, type SearchRangeKey } from './searchPerformance';
import { buildSearchPerformanceView, type SearchPerformanceView } from './searchPerformanceView';

const NOW = '2026-09-27T18:30:00Z';
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const GOOGLE_FIRST_DAY = '2026-03-01';
const BING_FIRST_DAY = '2026-05-01';
const LAST_REPORTED_DAY = '2026-09-26';
const LAST_REPORTED_HOUR = Date.parse('2026-09-27T15:00:00Z');
const HOME = 'https://my151.app/';

interface GoogleBody {
  startDate: string;
  endDate: string;
  dimensions: string[];
  dataState?: string;
}

function daysBetween(start: string, end: string): string[] {
  const days: string[] = [];
  for (let ms = Date.parse(`${start}T00:00:00Z`); ms <= Date.parse(`${end}T00:00:00Z`); ms += DAY_MS) {
    days.push(new Date(ms).toISOString().slice(0, 10));
  }
  return days;
}

/** Search Console keys hours in Pacific time; September is PDT. */
function pacificHourKey(ms: number): string {
  return `${new Date(ms - 7 * HOUR_MS).toISOString().slice(0, 19)}-07:00`;
}

const KEY_OF: Record<string, string> = { page: HOME, query: 'pokedex maker' };

/** One Google row per day at 1 click and 10 impressions, from GOOGLE_FIRST_DAY on. */
function googleRows(body: GoogleBody) {
  const [first, ...rest] = body.dimensions;
  if (first === 'hour') {
    // Hourly data starts at Pacific midnight of startDate. UTC hours 1, 7, 13, and 19 report nothing.
    const hours = [];
    for (let ms = Date.parse(`${body.startDate}T07:00:00Z`); ms <= LAST_REPORTED_HOUR; ms += HOUR_MS) {
      if (new Date(ms).getUTCHours() % 6 !== 1) hours.push(ms);
    }
    return hours.map((ms) => ({ keys: [pacificHourKey(ms), ...rest.map((d) => KEY_OF[d])], clicks: 1, impressions: 2, position: 4 }));
  }
  const days = daysBetween(body.startDate, body.endDate).filter((day) => day >= GOOGLE_FIRST_DAY && day <= LAST_REPORTED_DAY);
  if (first === 'date') return days.map((day) => ({ keys: [day], clicks: 1, impressions: 10, ctr: 0.1, position: 5 }));
  if (days.length === 0) return [];
  return [{ keys: body.dimensions.map((d) => KEY_OF[d]), clicks: days.length, impressions: 10 * days.length, ctr: 0.1, position: 5 }];
}

/** Bing's dated rows: one per day, plus an old page that only long windows reach. */
function bingRows(method: string) {
  const dated = (day: string) => `/Date(${Date.parse(`${day}T00:00:00Z`)})/`;
  const days = daysBetween(BING_FIRST_DAY, '2026-09-24');
  if (method === 'GetRankAndTrafficStats') return days.map((day) => ({ Date: dated(day), Clicks: 2, Impressions: 20 }));
  if (method === 'GetPageStats') {
    return [
      ...days.map((day) => ({ Date: dated(day), Query: HOME, Clicks: 1, Impressions: 5 })),
      { Date: dated('2026-05-02'), Query: 'https://my151.app/old', Clicks: 1, Impressions: 9 },
    ];
  }
  return days.map((day) => ({ Date: dated(day), Query: 'make a pokedex', Clicks: 1, Impressions: 3 }));
}

function stubProviders() {
  const googleBodies: GoogleBody[] = [];
  let googleCalls = 0;
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const json = (value: unknown) => new Response(JSON.stringify(value));
    if (url.hostname === 'oauth2.googleapis.com') {
      googleCalls += 1;
      return json({ access_token: 'token' });
    }
    if (url.hostname === 'www.googleapis.com') {
      googleCalls += 1;
      const body = JSON.parse(String(init?.body)) as GoogleBody;
      googleBodies.push(body);
      return json({ rows: googleRows(body) });
    }
    if (url.hostname === 'ssl.bing.com') return json({ d: bingRows(url.pathname.split('/').pop() ?? '') });
    throw new Error(`Unexpected fetch: ${input}`);
  });
  return {
    googleBodies,
    takeGoogleCalls() {
      const calls = googleCalls;
      googleCalls = 0;
      return calls;
    },
  };
}

interface Expected {
  window: [string, string];
  previous: [string, string] | null;
  googleClicks: number;
  buckets: number;
  bingPrevious: boolean;
}

// Windows end at the Google daily cutoff (three days back) or at the last reported hour.
const EXPECTED: Record<SearchRangeKey, Expected> = {
  '24h': {
    window: ['2026-09-26T16:00:00.000Z', '2026-09-27T15:00:00.000Z'],
    previous: ['2026-09-25T16:00:00.000Z', '2026-09-26T15:00:00.000Z'],
    googleClicks: 20,
    buckets: 24,
    bingPrevious: false,
  },
  '7d': { window: ['2026-09-18', '2026-09-24'], previous: ['2026-09-11', '2026-09-17'], googleClicks: 7, buckets: 7, bingPrevious: true },
  '28d': { window: ['2026-08-28', '2026-09-24'], previous: ['2026-07-31', '2026-08-27'], googleClicks: 28, buckets: 28, bingPrevious: true },
  '90d': { window: ['2026-06-27', '2026-09-24'], previous: ['2026-03-29', '2026-06-26'], googleClicks: 90, buckets: 90, bingPrevious: false },
  // The previous 180 days start before Google's first reported day, so no comparison exists.
  '180d': { window: ['2026-03-29', '2026-09-24'], previous: null, googleClicks: 180, buckets: 180, bingPrevious: false },
  '365d': { window: ['2025-09-25', '2026-09-24'], previous: null, googleClicks: 208, buckets: 365, bingPrevious: false },
  all: { window: ['2026-03-01', '2026-09-24'], previous: null, googleClicks: 208, buckets: 208, bingPrevious: false },
};

describe('search performance by range', () => {
  let view: SearchPerformanceView;
  let providers: ReturnType<typeof stubProviders>;
  let dailyCalls = 0;
  let hourlyCalls = 0;

  beforeAll(async () => {
    vi.useFakeTimers({ now: new Date(NOW), toFake: ['Date'] });
    vi.stubEnv('GOOGLE_SEARCH_SERVICE_ACCOUNT_JSON', '');
    vi.stubEnv('GOOGLE_SEARCH_CLIENT_ID', 'client');
    vi.stubEnv('GOOGLE_SEARCH_CLIENT_SECRET', 'secret');
    vi.stubEnv('GOOGLE_SEARCH_REFRESH_TOKEN', 'refresh');
    vi.stubEnv('BING_WEBMASTER_API_KEY', 'bing-key');
    providers = stubProviders();
    const daily = await buildDailySearchSnapshot();
    dailyCalls = providers.takeGoogleCalls();
    const hourly = await buildHourlySearchSnapshot();
    hourlyCalls = providers.takeGoogleCalls();
    view = buildSearchPerformanceView({ daily, hourly });
  });

  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('spends 24 Google calls on a daily refresh and 5 on an hourly one, token included', () => {
    expect(view.providers.google.status).toBe('ready');
    expect(dailyCalls).toBe(24);
    expect(hourlyCalls).toBe(5);
  });

  it('asks Google for hours of the last four Pacific days, and days of the last 16 months', () => {
    const hourly = providers.googleBodies.filter((body) => body.dimensions[0] === 'hour');
    expect(hourly.map((body) => body.dimensions.join('+'))).toEqual(['hour', 'hour+page', 'hour+query', 'hour+page+query']);
    for (const body of hourly) expect(body).toMatchObject({ startDate: '2026-09-24', endDate: '2026-09-27', dataState: 'hourly_all' });
    expect(providers.googleBodies.find((body) => body.dimensions[0] === 'date')).toMatchObject({
      startDate: '2025-05-27',
      endDate: '2026-09-24',
    });
  });

  it.each(SEARCH_RANGES)('%s: window, comparison, and pages match the range', (range) => {
    const expected = EXPECTED[range];
    const { google, bing } = view.byRange[range].providers;
    const pageRequests = providers.googleBodies
      .filter((body) => body.dimensions.join('+') === 'page')
      .map((body) => [body.startDate, body.endDate].join('..'));

    expect(google.current?.window).toEqual({ start: expected.window[0], end: expected.window[1] });
    expect(google.current?.metric.clicks).toBe(expected.googleClicks);
    expect(google.series).toHaveLength(expected.buckets);
    expect(google.topQueries.map((row) => row.key)).toEqual(['pokedex maker']);
    expect(google.comparison?.previous.window ?? null).toEqual(
      expected.previous && { start: expected.previous[0], end: expected.previous[1] },
    );
    const home = view.byRange[range].pages.find((page) => page.path === '/');
    expect(home?.engines.google.current?.clicks).toBe(expected.googleClicks);
    expect(home?.topQueries[0]?.query).toBe('pokedex maker');
    if (range !== '24h') expect(pageRequests).toContain(expected.window.join('..'));
    expect(bing.comparison != null).toBe(expected.bingPrevious);
  });

  it('24h: zero-fills hours Google skipped and compares with the 24 hours before', () => {
    const { google } = view.byRange['24h'].providers;
    expect(view.byRange['24h'].granularity).toBe('hour');
    expect(google.series.filter((point) => point.impressions === 0).map((point) => point.start)).toEqual([
      '2026-09-26T19:00:00.000Z',
      '2026-09-27T01:00:00.000Z',
      '2026-09-27T07:00:00.000Z',
      '2026-09-27T13:00:00.000Z',
    ]);
    expect(google.comparison?.previous.metric.impressions).toBe(40);
    expect(google.comparison?.delta.impressions).toBe(0);
  });

  it('24h: Bing reports no hours, so its view is empty', () => {
    const { bing } = view.byRange['24h'].providers;
    expect(bing).toMatchObject({ status: 'ready', current: null, comparison: null, series: [], topQueries: [] });
    expect(view.byRange['24h'].pages.every((page) => page.engines.bing.current === null)).toBe(true);
  });

  it('Bing: page and query rows count only inside each window, by their date', () => {
    const weekHome = view.byRange['7d'].pages.find((page) => page.path === '/');
    expect(weekHome?.engines.bing.current?.impressions).toBe(35);
    expect(weekHome?.engines.bing.previous?.impressions).toBe(35);
    expect(view.byRange['7d'].providers.bing.topQueries[0]).toMatchObject({ key: 'make a pokedex', impressions: 21 });
    expect(view.byRange['7d'].pages.some((page) => page.path === '/old')).toBe(false);
    // Bing starts inside the 90d previous window, so a page delta would compare with part of a period.
    expect(view.byRange['90d'].pages.find((page) => page.path === '/')?.engines.bing.previous).toBeNull();
    expect(view.byRange.all.pages.find((page) => page.path === '/old')?.engines.bing.current?.impressions).toBe(9);
    expect(view.byRange.all.providers.bing.current?.window).toEqual({ start: BING_FIRST_DAY, end: '2026-09-24' });
  });

  it('keeps the 28-day fields that frontends deployed before byRange read', () => {
    expect(view.periodDays).toBe(28);
    expect(view.pages).toEqual(view.byRange['28d'].pages);
    expect(view.providers.google.comparison).toMatchObject({ available: true, current: { range: { start: '2026-08-28', end: '2026-09-24' } } });
    expect(view.providers.bing.daily).toHaveLength(147);
  });
});
