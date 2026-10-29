import { createVerify, generateKeyPairSync } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bingBucketRows,
  buildDailySearchSnapshot,
  buildHourlySearchSnapshot,
  createGoogleServiceAccountAssertion,
  googleBucketRows,
  googleDimensionRows,
  googlePageQueryRows,
  parseBingDate,
  rollUp,
} from '../../api/_searchPerformance';

describe('search performance normalization', () => {
  it('normalizes Google date, hour, and dimension rows', () => {
    const payload = {
      rows: [
        { keys: ['2026-01-02'], clicks: 4, impressions: 40, ctr: 0.1, position: 7.5 },
        { keys: ['bad-date'], clicks: 99, impressions: 99 },
      ],
    };
    expect(googleBucketRows(payload, 'day')).toEqual([
      { start: '2026-01-02', keys: [], clicks: 4, impressions: 40, ctr: 0.1, position: 7.5 },
    ]);
    expect(googleBucketRows({ rows: [{ keys: ['2026-09-26T14:00:00-07:00', 'pokemon builder'], clicks: 1, impressions: 2 }] }, 'hour')).toEqual([
      { start: '2026-09-26T21:00:00.000Z', keys: ['pokemon builder'], clicks: 1, impressions: 2, ctr: 0.5, position: null },
    ]);
    expect(googleDimensionRows({ rows: [{ keys: ['/builder'], clicks: 2, impressions: 20, position: 8 }] })).toEqual([
      { key: '/builder', clicks: 2, impressions: 20, ctr: 0.1, position: 8 },
    ]);
    expect(googlePageQueryRows({ rows: [{ keys: ['/builder', 'pokemon builder'], clicks: 2, impressions: 20, position: 8 }] })).toEqual([
      { page: '/builder', query: 'pokemon builder', clicks: 2, impressions: 20, ctr: 0.1, position: 8 },
    ]);
  });

  it('parses Bing dates and sums dated rows by query inside a window', () => {
    expect(parseBingDate('/Date(1767312000000-0500)/')).toBe('2026-01-02');
    const payload = {
      d: [
        { Date: '/Date(1767312000000-0500)/', Query: 'pokemon builder', Clicks: 2, Impressions: 20, AvgImpressionPosition: 10 },
        { Date: '/Date(1767398400000-0500)/', Query: 'pokemon builder', Clicks: 3, Impressions: 30, AvgImpressionPosition: 5 },
      ],
    };
    expect(bingBucketRows(payload)).toHaveLength(2);
    expect(rollUp(bingBucketRows(payload), { start: '2026-01-01', end: '2026-01-31' })).toEqual([
      { keys: ['pokemon builder'], clicks: 5, impressions: 50, ctr: 0.1, position: 7 },
    ]);
    expect(rollUp(bingBucketRows(payload), { start: '2026-01-03', end: '2026-01-31' })).toEqual([
      { keys: ['pokemon builder'], clicks: 3, impressions: 30, ctr: 0.1, position: 5 },
    ]);
  });

  it('creates a valid service-account JWT assertion for Search Console', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const assertion = createGoogleServiceAccountAssertion(
      'my151-search@example-project.iam.gserviceaccount.com',
      privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      1_800_000_000,
    );
    const [headerPart, claimsPart, signaturePart] = assertion.split('.');
    expect(JSON.parse(Buffer.from(headerPart, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(claimsPart, 'base64url').toString())).toEqual({
      iss: 'my151-search@example-project.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
    expect(
      createVerify('RSA-SHA256')
        .update(`${headerPart}.${claimsPart}`)
        .end()
        .verify(publicKey, Buffer.from(signaturePart, 'base64url')),
    ).toBe(true);
  });

  it('returns independent not-connected states when server credentials are absent', async () => {
    const names = [
      'GOOGLE_SEARCH_SERVICE_ACCOUNT_JSON',
      'GOOGLE_SEARCH_CLIENT_ID',
      'GOOGLE_SEARCH_CLIENT_SECRET',
      'GOOGLE_SEARCH_REFRESH_TOKEN',
      'BING_WEBMASTER_API_KEY',
    ] as const;
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    try {
      for (const name of names) delete process.env[name];
      const daily = await buildDailySearchSnapshot();
      const hourly = await buildHourlySearchSnapshot();
      expect(daily.providers.google.status).toBe('not_configured');
      expect(daily.providers.bing.status).toBe('not_configured');
      expect(hourly.providers.google.status).toBe('not_configured');
    } finally {
      for (const name of names) {
        const value = previous[name];
        if (value == null) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});

describe('Google daily window', () => {
  const names = [
    'GOOGLE_SEARCH_SERVICE_ACCOUNT_JSON',
    'GOOGLE_SEARCH_CLIENT_ID',
    'GOOGLE_SEARCH_CLIENT_SECRET',
    'GOOGLE_SEARCH_REFRESH_TOKEN',
    'BING_WEBMASTER_API_KEY',
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    for (const name of names) {
      const value = previous[name];
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('ends on Search Console\'s last final day and keeps the newer days as fresh', async () => {
    for (const name of names) delete process.env[name];
    process.env.GOOGLE_SEARCH_CLIENT_ID = 'id';
    process.env.GOOGLE_SEARCH_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_SEARCH_REFRESH_TOKEN = 'refresh';
    vi.useFakeTimers({ now: Date.parse('2026-10-26T19:00:00Z'), toFake: ['Date'] });
    const day = (date: string, clicks: number) => ({ keys: [date], clicks, impressions: clicks * 10, ctr: 0.1, position: 5 });
    const dateQueries: { endDate: string; dataState?: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://oauth2.googleapis.com/')) return Response.json({ access_token: 'token' });
      const body = JSON.parse(String(init?.body)) as { endDate: string; dimensions: string[]; dataState?: string };
      if (body.dimensions.join() !== 'date') return Response.json({ rows: [] });
      dateQueries.push({ endDate: body.endDate, dataState: body.dataState });
      return Response.json({
        rows: body.dataState === 'all'
          ? [day('2026-10-23', 9), day('2026-10-24', 11), day('2026-10-25', 4)]
          : [day('2026-10-22', 7), day('2026-10-23', 8), day('2026-10-24', 10)],
      });
    }));

    const google = (await buildDailySearchSnapshot()).providers.google;

    expect(dateQueries).toEqual([{ endDate: '2026-10-25' }, { endDate: '2026-10-25', dataState: 'all' }]);
    expect(google.dataThrough).toBe('2026-10-24');
    expect(google.series.map((point) => [point.start, point.clicks])).toEqual([
      ['2026-10-22', 7],
      ['2026-10-23', 8],
      ['2026-10-24', 10],
    ]);
    expect(google.fresh?.map((point) => [point.start, point.clicks])).toEqual([['2026-10-25', 4]]);
    expect(google.ranges['7d']?.window).toEqual({ start: '2026-10-18', end: '2026-10-24' });
  });
});
