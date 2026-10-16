import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordRedisCommands } from '@/lib/recordRedisCommands';
import { buildDashboard, type DashboardSource } from '../../../api/_dashboard';
import { mergeFavoriteRecord, parseFavoriteSnapshot } from '../../../api/_favoriteRecord';
import type { DashboardRange } from '../../../api/_range';

vi.hoisted(() => {
  process.env.UPSTASH_REDIS_REST_URL ||= 'https://example.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN ||= 'test-token';
});

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 8, 12);

function picker(cid: string, snapshots: { at: number; fills: Record<string, number> }[]) {
  let rec = null;
  for (const [i, { at, fills }] of snapshots.entries()) {
    const snapshot = parseFavoriteSnapshot({ v: 1, fills })!;
    rec = mergeFavoriteRecord(rec, { cid, id: `${cid}-${i}`, now: at, kind: 'progress', snapshot, events: [] });
  }
  return rec!;
}

const pickers = [
  picker('pick-a', [
    { at: NOW - 3 * DAY, fills: { 'water|1': 7 } },
    { at: NOW - DAY, fills: { 'fire|1': 6, 'water|1': 9, 'starter|1': 6, 'favorite|1': 6 } },
  ]),
  picker('pick-b', [{ at: NOW - 2 * DAY, fills: { 'fire|1': 6, 'water|1': 7 } }]),
  picker('pick-c', [{ at: NOW - 2 * DAY, fills: { 'fire|1': 4, 'water|1': 9 } }]),
  picker('pick-old', [{ at: NOW - 30 * DAY, fills: { 'fire|1': 146 } }]),
  picker('pick-gone', [{ at: NOW - DAY, fills: { 'fire|1': 136 } }]),
];

const json = <T extends { cid: string }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.cid, JSON.stringify(r)]));
const source: DashboardSource = {
  clients: {},
  archived: ['pick-gone'],
  funnel: {},
  funnelWindow: null,
  leagueClients: {},
  favoriteClients: json(pickers),
};
const dash = (range: DashboardRange) => buildDashboard(source, { range }, NOW);

describe('favoritePicks', () => {
  it('counts each cell from the latest snapshot of the charts active in the range (1, 2, 3)', () => {
    const week = dash('7d').favoritePicks;
    expect(week.charts).toBe(3);
    expect(week.cells['fire|1']).toEqual([[6, 2], [4, 1]]);
    expect(week.cells['water|1']).toEqual([[9, 2], [7, 1]]);
    const all = dash('all').favoritePicks;
    expect(all.charts).toBe(4);
    expect(all.cells['fire|1']).toEqual([[6, 2], [4, 1], [146, 1]]);
  });

  it('keeps an archived Picker browser listed and flagged, and out of the counts (3)', () => {
    const d = dash('all');
    expect(d.browsers.picker.find((u) => u.cid === 'pick-gone')?.archived).toBe(true);
    expect(d.browsers.picker.find((u) => u.cid === 'pick-a')?.archived).toBe(false);
    expect(d.favoritePicks.cells['fire|1'].some(([id]) => id === 136)).toBe(false);
  });

  it('lists only Pokémon picked in a cell, most first, then lowest id (4, 5)', () => {
    const { cells } = dash('7d').favoritePicks;
    expect(Object.keys(cells).sort()).toEqual(['favorite|1', 'fire|1', 'starter|1', 'water|1']);
    for (const rows of Object.values(cells)) {
      for (const [, n] of rows) expect(n).toBeGreaterThan(0);
    }
    expect(dash('all').favoritePicks.cells['fire|1'].slice(1)).toEqual([[4, 1], [146, 1]]);
  });

  it('ranks the overall top by charts, not by cells (6)', () => {
    expect(dash('7d').favoritePicks.top).toEqual([[6, 2], [9, 2], [4, 1], [7, 1]]);
  });
});

describe('submissions Redis bill with the pick counts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock('../../../api/_shared.js');
  });

  it('adds no Redis command for the counts (7)', async () => {
    vi.doMock('../../../api/_shared.js', async (original) => ({
      ...(await original<typeof import('../../../api/_shared.js')>()),
      requireAdmin: async () => true,
    }));
    const { default: handler } = await import('../../../api/submissions');
    const commands = recordRedisCommands((cmd) => {
      const [name, key] = [cmd[0].toLowerCase(), cmd[1]];
      if (name === 'hgetall' && key === 'favorites:clients') return Object.entries(json(pickers)).flat();
      return [];
    });
    let body: { favoritePicks?: { charts: number } } = {};
    const res = {
      setHeader: () => res,
      status: () => res,
      json: (b: typeof body) => {
        body = b;
        return res;
      },
    };
    await handler({ method: 'GET', query: { range: 'all' }, headers: {} } as never, res as never);
    expect(body.favoritePicks?.charts).toBe(5);
    expect(commands.map((c) => `${c[0].toLowerCase()} ${c[1]}`).sort()).toEqual([
      'hgetall clients',
      'hgetall favorites:clients',
      'hgetall funnel',
      'hgetall league:clients',
      'smembers clients:archived',
    ]);
  });
});
