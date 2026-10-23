import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordRedisCommands } from '@/lib/recordRedisCommands';
import type { BrowserRecords } from './browserRecords';

// `/api/submissions?cid=` loads one browser for the admin page. Upstash bills
// per command, so the test pins the bill: one read per store, 4 in all.
// api/submit.ts keys a second person on a shared browser `<cid>::<country>`;
// the report's country must find that Dex record in the same one read.

vi.hoisted(() => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
});

const dex = {
  cid: 'old', firstTs: 1, firstAt: '1970-01-01T00:00:00.001Z', lastTs: 2, lastAt: '1970-01-01T00:00:00.002Z',
  submits: 1, sessions: 1, sessionMs: [1], sessionLog: [{ ts: 2, ids: [1] }], maxDepth: 1, localHour: 0,
  everIds: [1], latestIds: [1], completed: false, exported: false,
};

function clients(stored: Record<string, unknown>) {
  return (cmd: string[]) =>
    cmd[0] === 'hmget' && cmd[1] === 'clients' ? cmd.slice(2).map((f) => (f in stored ? JSON.stringify(stored[f]) : null)) : null;
}

async function call(query: Record<string, string>, reply: (cmd: string[]) => unknown) {
  vi.doMock('../../../api/_shared.js', async (original) => ({
    ...(await original<typeof import('../../../api/_shared.js')>()),
    requireAdmin: async () => true,
  }));
  const { default: handler } = await import('../../../api/submissions');
  const commands = recordRedisCommands(reply);
  let body = {} as BrowserRecords;
  const res = {
    setHeader: () => res,
    status: () => res,
    json: (b: BrowserRecords) => {
      body = b;
      return res;
    },
  };
  await handler({ method: 'GET', query, headers: {} } as never, res as never);
  return { body, commands: commands.map((c) => c.join(' ')) };
}

describe('submissions for one browser', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock('../../../api/_shared.js');
  });

  it('reads one field from each store and nothing else', async () => {
    const { body, commands } = await call({ cid: 'old' }, clients({ old: dex }));
    expect(commands.sort()).toEqual([
      'hget export-survey-skips old',
      'hget favorites:clients old',
      'hget league:clients old',
      'hmget clients old',
    ]);
    expect(body.dex?.cid).toBe('old');
    expect(body.league).toBeNull();
    expect(body.favorite).toBeNull();
  });

  it("finds the report country's Dex record in the same read", async () => {
    const eg = { ...dex, cid: 'old::EG', country: 'EG' };
    const { body, commands } = await call({ cid: 'old', country: 'EG' }, clients({ 'old::EG': eg }));
    expect(commands.sort()).toEqual([
      'hget export-survey-skips old',
      'hget favorites:clients old',
      'hget league:clients old',
      'hmget clients old::EG old',
    ]);
    expect(body.dex?.cid).toBe('old::EG');
  });

  it('falls back to the plain record when the country has none', async () => {
    const { body } = await call({ cid: 'old', country: 'EG' }, clients({ old: dex }));
    expect(body.dex?.cid).toBe('old');
  });
});
