import { describe, expect, it } from 'vitest';
import {
  bingDailyRows,
  bingDimensionRows,
  buildSearchPerformanceSnapshot,
  googleDailyRows,
  googleDimensionRows,
  parseBingDate,
} from '../../api/_searchPerformance';
import { summarizeSearchWindow, type SearchDailyPoint } from './searchPerformance';

describe('search performance normalization', () => {
  it('sums a trailing window and impression-weights position', () => {
    const daily: SearchDailyPoint[] = [
      { date: '2026-01-01', clicks: 1, impressions: 10, ctr: 0.1, position: 20 },
      { date: '2026-01-02', clicks: 2, impressions: 30, ctr: 2 / 30, position: 10 },
      { date: '2026-01-03', clicks: 3, impressions: 60, ctr: 0.05, position: 5 },
    ];
    expect(summarizeSearchWindow(daily, 2)).toEqual({
      clicks: 5,
      impressions: 90,
      ctr: 5 / 90,
      position: (30 * 10 + 60 * 5) / 90,
    });
  });

  it('normalizes Google daily and dimension rows', () => {
    const payload = {
      rows: [
        { keys: ['2026-01-02'], clicks: 4, impressions: 40, ctr: 0.1, position: 7.5 },
        { keys: ['bad-date'], clicks: 99, impressions: 99 },
      ],
    };
    expect(googleDailyRows(payload)).toEqual([
      { date: '2026-01-02', clicks: 4, impressions: 40, ctr: 0.1, position: 7.5 },
    ]);
    expect(googleDimensionRows({ rows: [{ keys: ['/builder'], clicks: 2, impressions: 20, position: 8 }] })).toEqual([
      { key: '/builder', clicks: 2, impressions: 20, ctr: 0.1, position: 8 },
    ]);
  });

  it('parses Bing dates and collapses dated rows by query', () => {
    expect(parseBingDate('/Date(1767312000000-0500)/')).toBe('2026-01-02');
    const payload = {
      d: [
        { Date: '/Date(1767312000000-0500)/', Query: 'pokemon builder', Clicks: 2, Impressions: 20, AvgImpressionPosition: 10 },
        { Date: '/Date(1767398400000-0500)/', Query: 'pokemon builder', Clicks: 3, Impressions: 30, AvgImpressionPosition: 5 },
      ],
    };
    expect(bingDailyRows(payload)).toHaveLength(2);
    expect(bingDimensionRows(payload)).toEqual([
      { key: 'pokemon builder', clicks: 5, impressions: 50, ctr: 0.1, position: 7 },
    ]);
  });

  it('returns independent not-connected states when server credentials are absent', async () => {
    const names = [
      'GOOGLE_SEARCH_CLIENT_ID',
      'GOOGLE_SEARCH_CLIENT_SECRET',
      'GOOGLE_SEARCH_REFRESH_TOKEN',
      'BING_WEBMASTER_API_KEY',
    ] as const;
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    try {
      for (const name of names) delete process.env[name];
      const snapshot = await buildSearchPerformanceSnapshot();
      expect(snapshot.providers.google.status).toBe('not_configured');
      expect(snapshot.providers.bing.status).toBe('not_configured');
    } finally {
      for (const name of names) {
        const value = previous[name];
        if (value == null) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});
