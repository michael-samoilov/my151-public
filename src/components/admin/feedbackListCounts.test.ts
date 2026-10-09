import { describe, expect, it, vi } from 'vitest';

// Each Redis command the handler sends is one billed Upstash command.
const sent: string[] = [];
let list: string[] = [];
let hashes: Record<string, Record<string, number>> = {};
vi.mock('../../../api/_shared', () => ({
  redis: {
    lrange: async (_k: string, a: number, b: number) => (sent.push('LRANGE'), list.slice(a, b + 1)),
    llen: async () => (sent.push('LLEN'), list.length),
    hgetall: async (k: string) => (sent.push('HGETALL'), hashes[k] ?? null),
  },
  requireAdmin: async () => true,
  firstQueryValue: (v: unknown) => (v == null ? undefined : String(v)),
}));
const { default: handler } = await import('../../../api/feedback-list');

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 9, 12);
const stamp = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Reports newest first, as api/feedback.ts stores them, plus the daily hashes it bumps. */
function seed(ages: [number, string][]) {
  list = ages.map(([days, category], i) => JSON.stringify({ id: `r${i}`, ts: NOW - days * DAY, category, message: 'm' }));
  hashes = {};
  for (const [days, category] of ages) {
    const h = (hashes[`feedback:count:${stamp(NOW - days * DAY)}`] ??= {});
    h[category] = (h[category] ?? 0) + 1;
  }
}

async function call(limit: number) {
  sent.length = 0;
  let body: { last7: Record<string, number>; last30: Record<string, number> } | undefined;
  const res = { status: () => res, json: (b: typeof body) => ((body = b), res), setHeader: () => res };
  await handler({ query: { limit: String(limit) }, headers: {} } as never, res as never);
  return { body: body!, sent: [...sent] };
}

describe('feedback-list counts', () => {
  const AGES: [number, string][] = [[0, 'bug'], [2, 'idea'], [6, 'bug'], [7, 'bug'], [29, 'idea'], [30, 'bug'], [45, 'other']];

  it('counts from the first page when it reaches past 30 days, with no daily hash read', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    seed(AGES);
    const { body, sent } = await call(200);
    expect(body.last7).toEqual({ bug: 2, idea: 1 });
    expect(body.last30).toEqual({ bug: 3, idea: 2 });
    expect(sent.sort()).toEqual(['LLEN', 'LRANGE']);
    vi.useRealTimers();
  });

  it('falls back to the 30 daily hashes, with the same totals, when the page stops inside the window', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    seed(AGES);
    const { body, sent } = await call(3);
    expect(body.last7).toEqual({ bug: 2, idea: 1 });
    expect(body.last30).toEqual({ bug: 3, idea: 2 });
    expect(sent.filter((c) => c === 'HGETALL')).toHaveLength(30);
    vi.useRealTimers();
  });
});
