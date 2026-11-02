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
      expect(JSON.stringify(row).length, list).toBeLessThan(800);
    }
    expect(JSON.stringify(heavyDex).length).toBeGreaterThan(20_000);
  });
});

describe('Bounces and suspected automation', () => {
  function pageLoad(cid: string, now: number) {
    const snapshot = parseFavoriteSnapshot({ v: 1, fills: {} })!;
    return mergeFavoriteRecord(null, { cid, id: `${cid}-0`, now, kind: 'progress', snapshot, events: ['favorites-open'], country: 'US' });
  }

  it('keeps a browser that never placed or touched anything out of the users, and in the funnel opens', () => {
    const d = dash(source({ picker: { 'p-load': pageLoad('p-load', NOW - MIN), 'p-user': picker('p-user', NOW - MIN) } }), '7d');
    expect(d.byTool.favorites.users).toBe(1);
    expect(d.bounces).toEqual({ dex: 0, league: 0, favorites: 1 });
    expect(d.favoriteFunnel.opened).toBe(2);
    expect(d.browsers.picker.find((r) => r.cid === 'p-load')?.bounced).toBe(true);
    expect(d.browsers.picker.find((r) => r.cid === 'p-user')?.bounced).toBeUndefined();
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

describe('Active users count engaged days only', () => {
  const day1 = NOW - 30 * 60 * MIN;
  const day2 = NOW - 2 * 60 * MIN;
  const attention = (segments: [number, number][]) => ({
    v: 1, coverageFrom: day1 - 60 * MIN, checkpointFrom: day1 - 60 * MIN, asOf: NOW, totalMs: segments.reduce((n, [a, b]) => n + b - a, 0),
    segments: segments.map(([start, end], i) => ({ id: `segment-${i}-0000`, start, end })),
  });
  const visits = (cid: string, extra: Record<string, unknown>) => dex(cid, day2, {
    firstTs: day1, sessions: 2, sessionMs: [5 * MIN, MIN],
    sessionLog: [{ ts: day1, ids: [1, 4, 7] }, { ts: day2, ids: [1, 4, 7] }], ...extra,
  });
  const clients = {
    glance: visits('glance', { attention: attention([[day1, day1 + 5 * MIN], [day2, day2 + 3_000]]) }),
    reader: visits('reader', { attention: attention([[day1, day1 + 5 * MIN], [day2, day2 + 20_000]]) }),
    legacy: visits('legacy', {}),
  };

  it('drops a day with no pick change and under 10 seconds of input', () => {
    const d = dash(source({ clients }), 'all');
    const dau = (ts: number) => d.byTool.dex.activity.find((p) => p.day === Date.UTC(2026, 9, new Date(ts).getUTCDate()))?.dau;
    expect([dau(day1), dau(day2)]).toEqual([3, 2]);
    expect(d.lastPointLabels.label24h).toBe(2);
    expect(dash(source({ clients }), '24h').byTool.all.users).toBe(2);
    expect(d.bounces).toEqual({ dex: 0, league: 0, favorites: 0 });
  });

  it('counts a day the page stayed on screen 10 seconds, with no input or pick change that day', () => {
    const viewer = visits('viewer', { attention: attention([[day1, day1 + 5 * MIN]]), seenDays: [Date.UTC(2026, 9, 9)] });
    const d = dash(source({ clients: { viewer, glance: clients.glance } }), 'all');
    const dau = (ts: number) => d.byTool.dex.activity.find((p) => p.day === Date.UTC(2026, 9, new Date(ts).getUTCDate()))?.dau;
    expect([dau(day1), dau(day2)]).toEqual([2, 1]);
    expect(d.lastPointLabels.label24h).toBe(1);
  });

  it('counts a seen day with no beacon that day, such as a crossing just before midnight sent after it', () => {
    const oct = (date: number) => Date.UTC(2026, 9, date);
    const built = oct(7) + 12 * 60 * MIN;
    const sent = oct(9) + 4_000;
    const late = dex('late', sent, {
      firstTs: built, sessions: 2, sessionMs: [5 * MIN, 0],
      sessionLog: [{ ts: built, ids: [1, 4, 7] }, { ts: sent, ids: [1, 4, 7] }],
      attention: { v: 1, coverageFrom: built, checkpointFrom: built, asOf: sent, totalMs: 5 * MIN, segments: [{ id: 'segment-late-0000', start: built, end: built + 5 * MIN }] },
      activeDays: [oct(7), oct(9)], activityCoverageFrom: built, seenDays: [oct(8)],
    });
    const d = dash(source({ clients: { late } }), 'all');
    expect([7, 8, 9].map((date) => d.byTool.dex.activity.find((p) => p.day === oct(date))?.dau)).toEqual([1, 1, 0]);
  });

  it('keeps a Picker visit under 10 seconds, with no input or picks, out of the users and in the funnel', () => {
    const empty = parseFavoriteSnapshot({ v: 1, fills: {} })!;
    let visit: FavoriteRecord | null = null;
    for (const [i, now] of [NOW - MIN - 8_000, NOW - MIN].entries()) {
      visit = mergeFavoriteRecord(visit, { cid: 'p-visit', id: `p-visit-${i}`, now, kind: 'progress', snapshot: empty, events: i ? [] : ['favorites-open'], country: 'US' });
    }
    const d = dash(source({ picker: { 'p-visit': visit, 'p-user': picker('p-user', NOW - MIN, 2) } }), '7d');
    expect(d.byTool.favorites.activity.find((p) => p.day === Date.UTC(2026, 9, 9))?.dau).toBe(1);
    expect(d.lastPointLabels.label24h).toBe(1);
    expect(d.bounces).toEqual({ dex: 0, league: 0, favorites: 1 });
    expect(d.favoriteFunnel.opened).toBe(2);
    expect(d.favoriteFunnel.buckets.find((b) => b.label === 'Not started')?.count).toBe(1);
    expect(d.browsers.picker.find((r) => r.cid === 'p-visit')?.bounced).toBe(true);
    expect(d.browsers.picker.find((r) => r.cid === 'p-user')?.bounced).toBeUndefined();
  });
});

describe('The Picker saves a visitor only after the first Pokémon', () => {
  const oct = (date: number, hour = 12) => Date.UTC(2026, 9, date, hour);
  const empty = parseFavoriteSnapshot({ v: 1, fills: {} })!;

  it('opens the funnel at placers plus bounces: saved no-pick records and visits beyond the placers saved after October 23', () => {
    const legacy = mergeFavoriteRecord(null, { cid: 'p-legacy', id: 'p-legacy-0', now: oct(20), kind: 'progress', snapshot: empty, events: ['favorites-open'], country: 'US' });
    const src = { ...source({ picker: { 'p-legacy': legacy, 'p-a': picker('p-a', oct(24)), 'p-b': picker('p-b', oct(24, 14)) } }), funnelWindow: { 'favorites-visit': 4 } };
    const funnel = buildDashboard(src, { range: '7d' }, oct(25)).favoriteFunnel;
    expect(funnel.opened).toBe(5);
    expect(funnel.buckets.find((b) => b.label === 'Not started')?.count).toBe(3);
  });

  it('never counts a record with no Pokémon placed as a user, even with a seen day', () => {
    const viewer = mergeFavoriteRecord(null, { cid: 'p-viewer', id: 'p-viewer-0', now: NOW - MIN, kind: 'progress', snapshot: empty, seen: [Date.UTC(2026, 9, 9)], events: ['favorites-open'], country: 'US' });
    const d = dash(source({ picker: { 'p-viewer': viewer } }), '7d');
    expect(d.byTool.favorites.activity.find((p) => p.day === Date.UTC(2026, 9, 9))?.dau ?? 0).toBe(0);
    expect(d.bounces.favorites).toBe(1);
    expect(d.browsers.picker.find((r) => r.cid === 'p-viewer')?.bounced).toBe(true);
  });
});

describe('Browser card time', () => {
  const oct = (date: number, hour = 12) => Date.UTC(2026, 9, date, hour);
  const filled = parseFavoriteSnapshot({ v: 1, fills: { 'fire|1': 6 } })!;
  const visit = (rec: FavoriteRecord | null, cid: string, i: number, now: number, inputMs?: number) =>
    mergeFavoriteRecord(rec, {
      cid, id: `${cid}-${i}`, now, receivedAt: now, kind: 'progress', snapshot: filled, events: [], country: 'US',
      ...(inputMs ? { attention: { v: 1 as const, segments: [{ id: `${cid}-segment-${i}`, start: now - inputMs, end: now }] } } : {}),
    });

  it('marks input time partial when the tool was used before input timing and before its recording began', () => {
    const early = visit(visit(null, 'p-early', 0, oct(8)), 'p-early', 1, oct(17), 7_000);
    const late = visit(visit(null, 'p-late', 0, oct(20)), 'p-late', 1, oct(22), 7_000);
    const rows = buildDashboard(source({ picker: { 'p-early': early, 'p-late': late } }), { range: 'all' }, oct(25)).browsers.picker;
    expect(rows.find((r) => r.cid === 'p-early')?.picker?.active).toEqual({ sessions: 2, totalMs: 7_000, partial: true });
    expect(rows.find((r) => r.cid === 'p-early')?.activeTotal?.partial).toBe(true);
    expect(rows.find((r) => r.cid === 'p-late')?.picker?.active).toEqual({ sessions: 1, totalMs: 7_000 });
  });

  it('adds the session length of sessions before input timing, marked partial', () => {
    let rec = visit(null, 'p-old', 0, oct(8, 21));
    rec = visit(rec, 'p-old', 1, Date.UTC(2026, 9, 9, 3, 0));
    rec = visit(rec, 'p-old', 2, Date.UTC(2026, 9, 9, 3, 29));
    rec = visit(rec, 'p-old', 3, oct(17, 14), 5_000);
    rec = visit(rec, 'p-old', 4, oct(17, 16), 2_000);
    const row = buildDashboard(source({ picker: { 'p-old': rec } }), { range: 'all' }, oct(25)).browsers.picker.find((r) => r.cid === 'p-old');
    expect(row?.picker?.active).toEqual({ sessions: 4, totalMs: 29 * MIN + 7_000, partial: true });
    expect(row?.activeTotal).toEqual({ sessions: 4, totalMs: 29 * MIN + 7_000, partial: true });
  });
});
