import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordRedisCommands } from './recordRedisCommands';
import { DAY_MS } from '../../api/_aggregate';
import { FAVORITES_LAUNCH_TS, LEAGUE_LAUNCH_TS, TOOL_CATALOG, sinceLaunchStarts } from '../../api/_crossTool';
import { buildDashboard, type DashboardSource } from '../../api/_dashboard';
import type { DashboardRange } from '../../api/_range';

// How the per-launch cross-tool snapshots can go wrong, and the test that
// catches each:
// 1. The window opens at the wrong instant: at the launch when the range
//    starts later, or at the range start when the launch is later.
// 2. A browser active only before the launch is counted.
// 3. A browser active after the launch loses a tool it used before it, so
//    the snapshot no longer counts every tool the browser ever used.
// 4. The plain `crossTool` snapshot changes, which breaks open tabs on the
//    old bundle.
// 5. The snapshots cost Redis commands: they must come from the records the
//    handler already read.

vi.hoisted(() => {
  process.env.UPSTASH_REDIS_REST_URL ||= 'https://example.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN ||= 'test-token';
});

const NOW = Date.UTC(2026, 9, 7, 17);
const AUG = Date.UTC(2026, 7, 20);
const SEP = Date.UTC(2026, 8, 20);
const OCT = Date.UTC(2026, 9, 7, 5);

function dex(cid: string, sessions: number[]) {
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
    everIds: [1, 4, 7],
    latestIds: [1, 4, 7],
    completed: false,
    exported: false,
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
    maxCards: 1,
    maxSeats: 1,
    latest: { cards: 1, seats: 1, typed: 0, named: 0, aces: 0, leagueNamed: false },
    exportsCard: 0,
    exportsLeague: 0,
    tz: 'UTC',
    country: 'US',
    device: 'Desktop',
  };
}

const json = <T extends { cid: string }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.cid, JSON.stringify(r)]));
const dexRows = [dex('before-launch', [AUG]), dex('old-dex', [AUG]), dex('late-dex', [OCT])];
const leagueRows = [league('old-dex', [SEP])];
const source: DashboardSource = {
  clients: json(dexRows),
  archived: [],
  funnel: {},
  funnelWindow: null,
  leagueClients: json(leagueRows),
};
const dash = (range: DashboardRange) => buildDashboard(source, { range }, NOW);
const regionsOf = (snap: { eras: { regions: Record<string, number> }[] }) => {
  const sum: Record<string, number> = {};
  for (const e of snap.eras) for (const [k, n] of Object.entries(e.regions)) sum[k] = (sum[k] ?? 0) + n;
  return sum;
};

describe('since-launch window', () => {
  it('opens at the later of the range start and the launch (1)', () => {
    expect(sinceLaunchStarts(TOOL_CATALOG, null)).toEqual([
      { id: 'league', start: LEAGUE_LAUNCH_TS },
      { id: 'favorites', start: FAVORITES_LAUNCH_TS },
    ]);
    const between = LEAGUE_LAUNCH_TS + DAY_MS;
    expect(sinceLaunchStarts(TOOL_CATALOG, between)).toEqual([
      { id: 'league', start: between },
      { id: 'favorites', start: FAVORITES_LAUNCH_TS },
    ]);
    expect(sinceLaunchStarts(TOOL_CATALOG, LEAGUE_LAUNCH_TS - DAY_MS)[0]).toEqual({ id: 'league', start: LEAGUE_LAUNCH_TS });
  });

  it('skips the first tool and a tool with no launch day', () => {
    const catalog = [...TOOL_CATALOG.slice(0, 2), { id: 'next', label: 'Next', short: 'Next', launchedAt: null }];
    expect(sinceLaunchStarts(catalog, null).map((s) => s.id)).toEqual(['league']);
  });
});

describe('crossToolSince', () => {
  it('counts only browsers active after the launch, by every tool they ever used (2, 3)', () => {
    const all = dash('all');
    expect(regionsOf(all.crossToolSince.league)).toEqual({ dex: 1, 'dex+league': 1 });
    expect(regionsOf(all.crossToolSince.favorites)).toEqual({ dex: 1 });
  });

  it('opens at the range start when the range starts after the launch (1)', () => {
    // 7d opens on 30 Sep: old-dex's league session on 20 Sep is outside.
    expect(regionsOf(dash('7d').crossToolSince.league)).toEqual({ dex: 1 });
  });

  it('leaves the plain snapshot as it was (4)', () => {
    expect(regionsOf(dash('all').crossTool)).toEqual({ dex: 2, 'dex+league': 1 });
  });
});

describe('submissions Redis bill', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock('../../api/_shared.js');
  });

  async function call(range: string) {
    vi.doMock('../../api/_shared.js', async (original) => ({
      ...(await original<typeof import('../../api/_shared.js')>()),
      requireAdmin: async () => true,
    }));
    const { default: handler } = await import('../../api/submissions');
    const flat = (rows: Record<string, string>) => Object.entries(rows).flat();
    const commands = recordRedisCommands((cmd) => {
      const [name, key] = [cmd[0].toLowerCase(), cmd[1]];
      if (name === 'hgetall' && key === 'clients') return flat(json(dexRows));
      if (name === 'hgetall' && key === 'league:clients') return flat(json(leagueRows));
      if (name === 'smembers') return [];
      return [];
    });
    let body: { crossToolSince?: Record<string, unknown> } = {};
    const res = {
      setHeader: () => res,
      status: () => res,
      json: (b: typeof body) => {
        body = b;
        return res;
      },
    };
    await handler({ method: 'GET', query: { range }, headers: {} } as never, res as never);
    // The bill is the set of commands; the SDK may send them in any order.
    return { commands: commands.map((c) => `${c[0].toLowerCase()} ${c[0].toLowerCase() === 'eval' ? '<script>' : c[1]}`).sort(), body };
  }

  it('reads the same keys with the snapshots as without them (5)', async () => {
    const all = await call('all');
    expect(Object.keys(all.body.crossToolSince ?? {})).toEqual(['league', 'favorites']);
    expect(all.commands).toEqual([
      'hgetall clients',
      'hgetall favorites:clients',
      'hgetall funnel',
      'hgetall league:clients',
      'smembers clients:archived',
    ]);
    const week = await call('7d');
    expect(week.commands).toEqual([
      'eval <script>',
      'hgetall clients',
      'hgetall favorites:clients',
      'hgetall funnel',
      'hgetall league:clients',
      'smembers clients:archived',
    ]);
  });
});
