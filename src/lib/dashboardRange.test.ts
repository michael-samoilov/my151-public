import { describe, expect, it } from 'vitest';
import { buildDashboard, type DashboardSource } from '../../api/_dashboard';
import { DAY_MS, HOUR_MS } from '../../api/_aggregate';
import { DASHBOARD_RANGES, funnelDayKeys, type DashboardRange } from '../../api/_range';

// How the date range can go wrong, and the test that catches each:
// 1. Suite counts a browser the Active users label does not: an off-by-one
//    window edge, a merged two-tool browser counted twice, or a country-split
//    record counted twice.
// 2. A range that covers every browser still changes a card: a legacy record
//    with no session log dropped, or the archive applied twice.
// 3. The range leaks into what must keep every browser: the user lists and
//    their Load more totals, or the activity series behind the chart.
// 4. A funnel opens on fewer browsers than it built, so bounced goes negative.
// 5. A funnel reads the wrong counters: a day outside the window, or day
//    counters past their 120-day lifetime instead of the all-time hash.

const NOW = Date.UTC(2026, 8, 27, 17, 0, 0);
const ago = (ms: number) => NOW - ms;

function dex(cid: string, sessions: number[], extra: Record<string, unknown> = {}) {
  const firstTs = Math.min(...sessions);
  const lastTs = Math.max(...sessions);
  return {
    cid,
    firstTs,
    firstAt: new Date(firstTs).toISOString(),
    lastTs,
    lastAt: new Date(lastTs).toISOString(),
    submits: sessions.length,
    sessions: sessions.length,
    sessionMs: sessions.map(() => 60_000),
    sessionLog: sessions.map((ts) => ({ ts, ids: [1, 4, 7] })),
    maxDepth: 3,
    localHour: 12,
    tz: 'UTC',
    country: 'US',
    device: 'Mobile',
    os: 'iOS',
    browser: 'Safari',
    everIds: [1, 4, 7, 25],
    latestIds: [1, 4, 7],
    completed: false,
    exported: false,
    ...extra,
  };
}

function league(cid: string, sessions: number[]) {
  const firstTs = Math.min(...sessions);
  const lastTs = Math.max(...sessions);
  return {
    cid,
    firstTs,
    firstAt: new Date(firstTs).toISOString(),
    lastTs,
    lastAt: new Date(lastTs).toISOString(),
    submits: sessions.length,
    sessions: sessions.length,
    curSessionStart: lastTs,
    maxSessionMs: 60_000,
    sessionMs: sessions.map(() => 60_000),
    sessionLog: sessions.map((ts) => ({ ts })),
    maxCards: 2,
    maxSeats: 3,
    latest: { cards: 2, seats: 3, typed: 1, named: 0, aces: 0, leagueNamed: false },
    exportsCard: 0,
    exportsLeague: 0,
    tz: 'Europe/Berlin',
    country: 'DE',
    device: 'Desktop',
  };
}

const byCid = <T extends { cid: string }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.cid, JSON.stringify(r)]));

const source: DashboardSource = {
  clients: byCid([
    // Both tools: the dex side is old, the league side is recent.
    dex('both-0001', [ago(10 * DAY_MS)]),
    // One browser split by country: one half recent, one half old.
    dex('split-001::US', [ago(3 * DAY_MS)]),
    dex('split-001::DE', [ago(20 * DAY_MS)], { country: 'DE' }),
    // Legacy: no session log, active at first and last beacon only.
    { ...dex('legacy-01', [ago(30 * DAY_MS), ago(1 * DAY_MS)]), sessions: undefined, sessionMs: undefined, sessionLog: undefined },
    // Exactly on the 7-day edge: outside (the label counts (now − 168h, now]).
    dex('edge-0001', [ago(7 * DAY_MS)]),
    // Within the last hour, inside every range.
    dex('fresh-001', [ago(HOUR_MS)], { completed: true, exported: true, latestIds: [1, 4, 7, 25] }),
    // Archived: never counted, still listed.
    dex('archived1', [ago(2 * HOUR_MS)]),
  ]),
  archived: ['archived1'],
  funnel: { 'intro-shown': '12', 'league-open': '5' },
  funnelWindow: null,
  leagueClients: byCid([league('both-0001', [ago(2 * DAY_MS)]), league('lg-only01', [ago(8 * DAY_MS)])]),
  exportSurveySkips: null,
};

const page = { offset: 0, limit: 50 };
const dash = (range: DashboardRange) => buildDashboard(source, { ...page, range }, NOW);

describe('dashboard date range', () => {
  it('counts the same browsers in Suite as the Active users label', () => {
    const labels = dash('all').lastPointLabels;
    expect(dash('7d').byTool.all.users).toBe(labels.label168h);
    expect(dash('24h').byTool.all.users).toBe(labels.label24h);
    // both-0001, split-001, legacy-01, fresh-001.
    expect(dash('7d').byTool.all.users).toBe(4);
  });

  it('changes no card when the range covers every browser', () => {
    const { range: _a, rangeStart: _b, ...wide } = dash('365d');
    const { range: _c, rangeStart: _d, ...all } = dash('all');
    expect(wide).toEqual(all);
  });

  it('keeps every browser in the user lists and the activity series', () => {
    const all = dash('all');
    const day = dash('24h');
    expect(day.byTool.all.users).toBeLessThan(all.byTool.all.users);
    for (const k of ['records', 'leagueUsers', 'totalDexRecords', 'totalLeagueUsers', 'activity', 'lastPointLabels'] as const) {
      expect(day[k], k).toEqual(all[k]);
    }
    for (const tool of ['dex', 'league', 'all'] as const) {
      expect(day.byTool[tool].activity, tool).toEqual(all.byTool[tool].activity);
      expect(day.byTool[tool].hourly, tool).toEqual(all.byTool[tool].hourly);
    }
  });
});

const dayKey = (daysAgo: number) => `funnel:${new Date(ago(daysAgo * DAY_MS)).toISOString().slice(0, 10)}`;
const funnelDays: Record<string, Record<string, string>> = {
  [dayKey(8)]: { 'intro-shown': '5' },
  [dayKey(7)]: { 'intro-shown': '1' },
  [dayKey(0)]: { 'intro-shown': '1', 'league-open': '1' },
};

/** The source as the handler builds it: its script sums every field over
 *  the window's day keys. */
function withWindow(range: DashboardRange): DashboardSource {
  const keys = funnelDayKeys(range, NOW);
  if (!keys) return { ...source, funnelWindow: null };
  const sums: Record<string, number> = {};
  for (const k of keys) {
    for (const [field, n] of Object.entries(funnelDays[k] ?? {})) sums[field] = (sums[field] ?? 0) + Number(n);
  }
  return { ...source, funnelWindow: sums };
}
const funnels = (range: DashboardRange) => buildDashboard(withWindow(range), { ...page, range }, NOW);

describe('dashboard funnels by date range', () => {
  it('opens at least as many browsers as it built, at every range', () => {
    for (const range of DASHBOARD_RANGES) {
      const { dexFunnel, leagueFunnel } = funnels(range);
      expect(dexFunnel.opened, range).toBeGreaterThanOrEqual(dexFunnel.built);
      expect(leagueFunnel.opened, range).toBeGreaterThanOrEqual(leagueFunnel.placed);
    }
  });

  it("opens on the window's day counters and builds from the browsers first seen in it", () => {
    // 28 days: split-001, edge-0001, fresh-001, and both-0001 were first seen
    // in the window; its counters hold 5 + 1 + 1 intro views.
    expect(funnels('28d').dexFunnel).toMatchObject({ opened: 7, built: 4 });
    // 7 days opens on the edge day: 1 + 1 views, fewer than the 3 builders.
    expect(funnels('7d').dexFunnel).toMatchObject({ opened: 3, built: 3 });
    expect(funnels('7d').leagueFunnel).toMatchObject({ opened: 1, placed: 1 });
  });

  it('reads the all-time counters for windows older than the day counters', () => {
    expect(funnelDayKeys('90d', NOW)).toHaveLength(91);
    expect(funnelDayKeys('180d', NOW)).toBeNull();
    expect(funnels('180d').dexFunnel.opened).toBe(12);
    expect(funnels('all').leagueFunnel.opened).toBe(5);
  });
});
