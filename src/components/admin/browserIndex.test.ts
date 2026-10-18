import { describe, expect, it } from 'vitest';
import { buildDashboard, type DashboardSource } from '../../../api/_dashboard';
import { mergeFavoriteRecord, parseFavoriteSnapshot, type FavoriteRecord } from '../../../api/_favoriteRecord';
import type { DashboardRange } from '../../../api/_range';

const NOW = Date.UTC(2026, 9, 9, 12);
const MIN = 60_000;
const DAY = 86_400_000;

function dex(cid: string, end: number, extra: Record<string, unknown> = {}) {
  return {
    cid, firstTs: end - 10 * MIN, firstAt: new Date(end - 10 * MIN).toISOString(), lastTs: end, lastAt: new Date(end).toISOString(),
    submits: 2, sessions: 1, sessionMs: [10 * MIN], sessionLog: [{ ts: end, ids: [1, 4, 7] }], maxDepth: 3, localHour: 12,
    everIds: [1, 4, 7], latestIds: [1, 4, 7], completed: false, exported: false, country: 'US', device: 'Mobile', os: 'iOS',
    browser: 'Safari', tz: 'America/New_York', lang: 'en-US', locale: 'en', ...extra,
  };
}

function league(cid: string, end: number, extra: Record<string, unknown> = {}) {
  return {
    cid, firstTs: end - 20 * MIN, firstAt: new Date(end - 20 * MIN).toISOString(), lastTs: end, lastAt: new Date(end).toISOString(),
    submits: 2, sessions: 1, curSessionStart: end - 20 * MIN, maxSessionMs: 20 * MIN, sessionMs: [20 * MIN], sessionLog: [{ ts: end }],
    maxCards: 3, maxSeats: 3, latest: { cards: 3, seats: 3, typed: 0, named: 0, aces: 0, leagueNamed: false }, exportsCard: 1, exportsLeague: 0,
    country: 'US', device: 'Desktop', os: 'Windows', browser: 'Chrome', ...extra,
  };
}

function picker(cid: string, end: number, sessions = 1) {
  const snapshot = parseFavoriteSnapshot({ v: 1, fills: { 'fire|1': 6 } })!;
  let rec: FavoriteRecord | null = null;
  let n = 0;
  for (let i = sessions - 1; i >= 0; i--) {
    for (const now of [end - i * DAY - 5 * MIN, end - i * DAY]) {
      rec = mergeFavoriteRecord(rec, { cid, id: `${cid}-${n++}`, now, kind: 'progress', snapshot, events: [], country: 'GB' });
    }
  }
  return rec!;
}

const json = (rows: Record<string, unknown>) => Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, JSON.stringify(v)]));

function source(rows: { clients?: Record<string, unknown>; league?: Record<string, unknown>; picker?: Record<string, unknown>; archived?: string[] }): DashboardSource {
  return {
    clients: json(rows.clients ?? {}),
    archived: rows.archived ?? [],
    funnel: {},
    funnelWindow: null,
    leagueClients: json(rows.league ?? {}),
    favoriteClients: json(rows.picker ?? {}),
  };
}

const dash = (src: DashboardSource, range: DashboardRange) => buildDashboard(src, { range }, NOW);

describe('Newest browsers index', () => {
  it('lists every record of every tool, whatever the range, archived ones flagged (1)', () => {
    const clients: Record<string, unknown> = {};
    for (let i = 0; i < 650; i++) clients[`d-${i}`] = dex(`d-${i}`, NOW - (i === 0 ? MIN : 2 * DAY + i * MIN));
    const src = source({
      clients,
      league: { 'd-1': league('d-1', NOW - 3 * DAY), 'l-only': league('l-only', NOW - 40 * DAY) },
      picker: { 'p-only': picker('p-only', NOW - 9 * DAY) },
      archived: ['d-7'],
    });
    for (const range of ['24h', 'all'] as const) {
      const { browsers } = dash(src, range);
      expect(browsers.dex.map((r) => r.cid), range).toEqual(Array.from({ length: 650 }, (_, i) => `d-${i}`));
      expect(browsers.league.map((r) => r.cid), range).toEqual(['d-1', 'l-only']);
      expect(browsers.picker.map((r) => r.cid), range).toEqual(['p-only']);
      expect(browsers.dex.filter((r) => r.archived).map((r) => r.cid), range).toEqual(['d-7']);
    }
  });

  it('keeps each country-split Dex record on its own row with its browser’s other tools (2, 3)', () => {
    const src = source({
      clients: { abc: dex('abc', NOW - 2 * DAY, { country: 'US', latestIds: [1, 2, 3] }), 'abc::DE': dex('abc::DE', NOW - DAY, { country: 'DE', latestIds: [25] }) },
      league: { abc: league('abc', NOW - 3 * DAY) },
      picker: { abc: picker('abc', NOW - 4 * DAY) },
    });
    const { browsers } = dash(src, 'all');
    expect(browsers.dex.map((r) => [r.cid, r.country, r.dex?.count, r.league?.count, r.picker?.count])).toEqual([
      ['abc::DE', 'DE', 1, 3, 1],
      ['abc', 'US', 3, 3, 1],
    ]);
    expect(browsers.league.map((r) => [r.cid, r.dex?.count])).toEqual([['abc', 3]]);
  });

  it('keeps a browser with long histories in each tool to a few hundred bytes (4)', () => {
    const ids = Array.from({ length: 151 }, (_, i) => i + 1);
    const sections = Object.fromEntries(Array.from({ length: 20 }, (_, s) => [`s${s}`, ids.slice(s * 7, s * 7 + 7)]));
    const ends = Array.from({ length: 50 }, (_, i) => NOW - (50 - i) * DAY);
    const heavyDex = dex('heavy-browser-0123456789abcdef01234567', NOW, {
      sessions: 50, sessionMs: ends.map(() => 30 * MIN), sessionLog: ends.map((ts) => ({ ts, ids })),
      everIds: ids, latestIds: ids, latestSections: sections, everSections: sections, exported: true,
    });
    const heavyLeague = league('heavy-browser-0123456789abcdef01234567', NOW, { sessions: 50, sessionMs: ends.map(() => 30 * MIN), sessionLog: ends.map((ts) => ({ ts })) });
    const src = source({
      clients: { [heavyDex.cid]: heavyDex },
      league: { [heavyDex.cid]: heavyLeague },
      picker: { [heavyDex.cid]: picker(heavyDex.cid, NOW, 50) },
    });
    const { browsers } = dash(src, 'all');
    for (const list of ['dex', 'league', 'picker'] as const) {
      const row = browsers[list][0];
      expect(row.dex && row.league && row.picker, list).toBeTruthy();
      expect(JSON.stringify(row).length, list).toBeLessThan(600);
    }
    expect(JSON.stringify(heavyDex).length).toBeGreaterThan(20_000);
  });
});

describe('Page loads and suspected automation', () => {
  function pageLoad(cid: string, now: number) {
    const snapshot = parseFavoriteSnapshot({ v: 1, fills: {} })!;
    return mergeFavoriteRecord(null, { cid, id: `${cid}-0`, now, kind: 'progress', snapshot, events: ['favorites-open'], country: 'US' });
  }

  it('keeps a browser that never placed or touched anything out of the users, and in the funnel opens', () => {
    const d = dash(source({ picker: { 'p-load': pageLoad('p-load', NOW - MIN), 'p-user': picker('p-user', NOW - MIN) } }), '7d');
    expect(d.byTool.favorites.users).toBe(1);
    expect(d.pageLoads).toEqual({ dex: 0, league: 0, favorites: 1 });
    expect(d.favoriteFunnel.opened).toBe(2);
    expect(d.browsers.picker.find((r) => r.cid === 'p-load')?.pageLoadOnly).toBe(true);
    expect(d.browsers.picker.find((r) => r.cid === 'p-user')?.pageLoadOnly).toBeUndefined();
  });

  it('flags three fresh look-alike browsers within ten minutes, and a browser with no language', () => {
    const bot = (cid: string, at: number) =>
      dex(cid, at, { firstTs: at, sessionMs: [0], region: 'OH', device: 'Desktop', os: 'Linux', browser: 'Chrome' });
    const clients = {
      'b-0': bot('b-0', NOW - 60 * MIN),
      'b-4': bot('b-4', NOW - 56 * MIN),
      'b-9': bot('b-9', NOW - 51 * MIN),
      'b-late': bot('b-late', NOW - 30 * MIN),
      'person': dex('person', NOW - 58 * MIN, { region: 'OH', device: 'Desktop', os: 'Linux', browser: 'Chrome' }),
      'no-lang': dex('no-lang', NOW - MIN, { lang: undefined }),
    };
    const reasons = Object.fromEntries(dash(source({ clients }), 'all').browsers.dex.map((r) => [r.cid, r.suspect]));
    expect(reasons).toEqual({
      'b-0': ['burst'], 'b-4': ['burst'], 'b-9': ['burst'], 'b-late': undefined, person: undefined, 'no-lang': ['no-language'],
    });
  });
});
