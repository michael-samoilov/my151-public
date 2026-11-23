// keeps: Upstash bills each command, and browser specs stub /api/favorites, so only this sees the route's Redis bill.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '../../api/_vercel';
import { recordRedisCommands } from './recordRedisCommands';
import { mergeFavoriteRecord, parseFavoriteSnapshot, type FavoriteRecord } from '../../api/_favoriteRecord';

let handler: (req: VercelRequest, res: VercelResponse) => Promise<unknown>;
beforeAll(async () => {
  process.env.UPSTASH_REDIS_REST_URL ||= 'https://example.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN ||= 'test-token';
  ({ default: handler } = await import('../../api/favorites'));
});
afterEach(() => vi.unstubAllGlobals());

const NOW = Date.now();
const snapshot = { v: 1, fills: { 'water|1': 7, 'favorite|1': 7 } };
let ids = 0;
const beacon = (extra: Record<string, unknown>) => ({ cid: 'browser-0001', id: `request-${String(++ids).padStart(5, '0')}`, kind: 'progress', snapshot, ts: NOW, ...extra });

const isRecordWrite = (cmd: string[]) => cmd[0].toLowerCase() === 'eval' && cmd[1].includes('KEYS[6]');

async function send(extra: Record<string, unknown>, stored: FavoriteRecord | null = null) {
  const commands = recordRedisCommands((cmd) => {
    const name = cmd[0].toLowerCase();
    if (name === 'hget') return cmd[1] === 'favorites:clients' && stored ? JSON.stringify(stored) : null;
    if (name === 'evalsha' || (name === 'eval' && !isRecordWrite(cmd))) return [100, NOW + 60_000];
    return 1;
  });
  let status = 0;
  const res = { status: (s: number) => { status = s; return { json: () => undefined }; }, setHeader: () => undefined } as unknown as VercelResponse;
  await handler({ method: 'POST', body: beacon(extra), headers: {} } as unknown as VercelRequest, res);
  const write = commands.find(isRecordWrite);
  const argv = write ? write.slice(3 + Number(write[2])) : [];
  return {
    status,
    bill: commands.map((c) => c[0].toLowerCase()),
    events: write ? (JSON.parse(argv[4]) as { ev: string }[]).map((e) => e.ev) : [],
  };
}

const BILL = ['evalsha', 'evalsha', 'hget', 'hget', 'eval'];

describe('favorites beacon Redis bill', () => {
  it('records the completion popup, the export dialog and a detailed-stats export in the same five commands as a progress beacon', async () => {
    const stored = mergeFavoriteRecord(null, {
      cid: 'browser-0001', id: 'request-stored', now: NOW - 60_000, kind: 'progress', snapshot: parseFavoriteSnapshot(snapshot)!, events: ['favorites-open'],
    });
    for (const extra of [{}, { kind: 'nudge-shown' }, { kind: 'export-shown' }, { kind: 'export', exportKind: 'full', stats: true }]) {
      const sent = await send(extra, stored);
      expect(sent.status).toBe(200);
      expect(sent.bill).toEqual(BILL);
    }
  });

  it('adds only the per-network admission and the ceiling check for a new browser', async () => {
    expect((await send({})).bill).toEqual(['evalsha', 'evalsha', 'hget', 'hget', 'incr', 'expire', 'eval', 'hlen']);
  });

  it('journals the export dialog once per visit, so reopening it adds no counter or journal entry', async () => {
    const first = await send({ kind: 'export-shown' });
    expect(first.events).toEqual(['favorites-open', 'favorites-first-pick', 'favorites-export-shown']);
    const stored = mergeFavoriteRecord(null, {
      cid: 'browser-0001', id: 'request-stored', now: NOW - 60_000, kind: 'export-shown',
      snapshot: parseFavoriteSnapshot(snapshot)!, events: ['favorites-open', 'favorites-first-pick', 'favorites-export-shown'],
    });
    const again = await send({ kind: 'export-shown' }, stored);
    expect(again.events).toEqual([]);
    expect(again.bill).toEqual(BILL);
  });

  it('journals the completion popup once per visit, apart from the export dialog', async () => {
    const first = await send({ kind: 'nudge-shown' });
    expect(first.events).toEqual(['favorites-open', 'favorites-first-pick', 'favorites-nudge-complete-shown']);
    const stored = mergeFavoriteRecord(null, {
      cid: 'browser-0001', id: 'request-stored', now: NOW - 60_000, kind: 'nudge-shown',
      snapshot: parseFavoriteSnapshot(snapshot)!, events: ['favorites-open', 'favorites-first-pick', 'favorites-nudge-complete-shown'],
    });
    expect((await send({ kind: 'nudge-shown' }, stored)).events).toEqual([]);
    expect((await send({ kind: 'export-shown' }, stored)).events).toEqual(['favorites-export-shown']);
  });

  it('marks detailed stats on an export of either layout that has them', async () => {
    expect((await send({ kind: 'export', exportKind: 'full', stats: true })).events).toContain('favorites-export-stats');
    expect((await send({ kind: 'export', exportKind: 'full' })).events).not.toContain('favorites-export-stats');
    expect((await send({ kind: 'export', exportKind: 'simplified', stats: true })).events).toContain('favorites-export-stats');
    expect((await send({ kind: 'export', exportKind: 'simplified' })).events).not.toContain('favorites-export-stats');
  });
});
