import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '../api/_vercel';

type Value = string | number | Map<string, unknown> | unknown[] | Set<string>;
const store = new Map<string, Value>();
const limits = new Map<string, number>();

function hash(key: string): Map<string, unknown> {
  const found = store.get(key);
  if (found instanceof Map) return found;
  const created = new Map<string, unknown>();
  store.set(key, created);
  return created;
}
function list(key: string): unknown[] {
  const found = store.get(key);
  if (Array.isArray(found)) return found;
  const created: unknown[] = [];
  store.set(key, created);
  return created;
}
function span(length: number, start: number, stop: number): [number, number] {
  const from = start < 0 ? Math.max(0, length + start) : start;
  const to = stop < 0 ? length + stop : Math.min(stop, length - 1);
  return [from, to];
}

const fake: Record<string, (...args: never[]) => unknown> = {
  hget: async (key: string, field: string) => hash(key).get(field) ?? null,
  hset: async (key: string, fields: Record<string, unknown>) => {
    for (const [field, value] of Object.entries(fields)) hash(key).set(field, value);
    return 1;
  },
  hlen: async (key: string) => hash(key).size,
  hexists: async (key: string, field: string) => (hash(key).has(field) ? 1 : 0),
  hincrby: async (key: string, field: string, by: number) => {
    const next = Number(hash(key).get(field) ?? 0) + by;
    hash(key).set(field, next);
    return next;
  },
  hgetall: async (key: string) => (hash(key).size ? Object.fromEntries(hash(key)) : null),
  incr: async (key: string) => {
    const next = Number(store.get(key) ?? 0) + 1;
    store.set(key, next);
    return next;
  },
  expire: async () => 1,
  lpush: async (key: string, ...values: unknown[]) => list(key).unshift(...values.reverse()),
  rpush: async (key: string, ...values: unknown[]) => list(key).push(...values),
  ltrim: async (key: string, start: number, stop: number) => {
    const items = list(key);
    const [from, to] = span(items.length, start, stop);
    store.set(key, items.slice(from, to + 1));
    return 'OK';
  },
  lrange: async (key: string, start: number, stop: number) => {
    const items = list(key);
    const [from, to] = span(items.length, start, stop);
    return items.slice(from, to + 1);
  },
  llen: async (key: string) => list(key).length,
  sadd: async (key: string, member: string) => {
    const set = (store.get(key) as Set<string> | undefined) ?? new Set<string>();
    store.set(key, set);
    const had = set.has(member);
    set.add(member);
    return had ? 0 : 1;
  },
  eval: async (script: string, keys: string[], args: unknown[]) => {
    if (script.includes('ipairs(KEYS)') && script.includes("'HEXISTS'")) return keys.some((key) => hash(key).has(String(args[0]))) ? 1 : 0;
    if (script.includes("'LRANGE'")) {
      return keys.flatMap((key) => {
        const [from, to] = span(list(key).length, Number(args[0]), Number(args[1]));
        return [list(key).length, list(key).slice(from, to + 1)];
      });
    }
    const [records, versions] = keys;
    const [cid, expected, json, max] = args.map(String);
    if (keys.length === 6 && store.has(keys[2])) return 2;
    const current = String(hash(versions).get(cid) ?? '0');
    if (current !== expected) return 0;
    if (!hash(records).has(cid) && hash(records).size >= Number(max)) return keys.length === 6 ? 3 : 2;
    hash(records).set(cid, json);
    hash(versions).set(cid, String(Number(current) + 1));
    if (keys.length === 6) store.set(keys[2], '1');
    return 1;
  },
};
const pipeline = () => {
  const queued: [string, unknown[]][] = [];
  const chain: Record<string, unknown> = new Proxy({}, {
    get: (_target, name: string) =>
      name === 'exec'
        ? async () => Promise.all(queued.map(([op, args]) => fake[op](...(args as never[]))))
        : (...args: unknown[]) => {
            queued.push([name, args]);
            return chain;
          },
  });
  return chain;
};

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor() {
      return { ...fake, pipeline };
    }
  },
}));
vi.mock('@upstash/ratelimit', () => {
  const units: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return {
    Ratelimit: class {
      max: number;
      windowMs: number;
      prefix: string;
      static fixedWindow(max: number, window: string) {
        const [count, unit] = window.split(' ');
        return { max, windowMs: Number(count) * units[unit] };
      }
      constructor(options: { limiter: { max: number; windowMs: number }; prefix: string }) {
        this.max = options.limiter.max;
        this.windowMs = options.limiter.windowMs;
        this.prefix = options.prefix;
      }
      async limit(key: string) {
        const slot = Math.floor(Date.now() / this.windowMs);
        const id = `${this.prefix}:${key}:${slot}`;
        const used = (limits.get(id) ?? 0) + 1;
        limits.set(id, used);
        return { success: used <= this.max, reset: (slot + 1) * this.windowMs };
      }
    },
  };
});
vi.mock('../api/_activityHistoryStore', () => ({
  acknowledgeUnstored: () => undefined,
  appendMinuteActivity: async () => undefined,
}));
vi.mock('../api/_exportStats', async (original) => ({
  ...(await original<typeof import('../api/_exportStats')>()),
  bumpDexPickFreq: async () => undefined,
  recordToolExport: async () => undefined,
}));

const { default: submit } = await import('../api/submit');
const { default: league } = await import('../api/league');
const { default: favorites } = await import('../api/favorites');
const { default: feedback } = await import('../api/feedback');
const { default: crash } = await import('../api/crash');
const { default: feedbackList } = await import('../api/feedback-list');
const { default: event } = await import('../api/event');
const { default: archiveEntry } = await import('../api/archive-entry');
const { EVOLUTION_CHAIN_BY_ID } = await import('../api/_chains');

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;
async function call(handler: Handler, body: unknown, headers: Record<string, string> = {}, method = 'POST') {
  let status = 0;
  let json: unknown;
  const res = {
    status: (code: number) => {
      status = code;
      return { json: (value: unknown) => (json = value) };
    },
    setHeader: () => res,
  } as unknown as VercelResponse;
  await handler({ method, body, headers: { 'x-real-ip': '203.0.113.7', ...headers }, query: {}, socket: {} } as unknown as VercelRequest, res);
  return { status, json };
}

const DEX_IDS = Object.keys(EVOLUTION_CHAIN_BY_ID).map(Number);
const cidFor = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const dexBody = (cid: string, extra: Record<string, unknown> = {}) => ({ cid, kind: 'progress', ids: [1, 4, 7], ts: Date.now(), ...extra });
const leagueBody = (cid: string) => ({ cid, kind: 'progress', summary: { cards: 1, seats: 1, typed: 0, named: 0, aces: 0 }, ts: Date.now() });
const favoriteBody = (cid: string, id: number) => ({ cid, id: `request-${String(id).padStart(6, '0')}`, kind: 'progress', snapshot: { v: 1, fills: { 'water|1': 7 } }, ts: Date.now() });
const dexRecord = (cid: string) => {
  const raw = hash('clients').get(cid);
  return raw ? (JSON.parse(String(raw)) as { latestSections?: Record<string, number[]>; sessionLog: { ts: number }[] }) : undefined;
};

beforeEach(() => {
  store.clear();
  limits.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.UTC(2026, 10, 11, 12));
  process.env.ADMIN_TOKEN = 'admin-token-for-tests';
});
afterEach(() => {
  vi.useRealTimers();
});

describe('client cap exhaustion', () => {
  it('rejects a client ID the app never mints', async () => {
    for (const handler of [submit, league, event] as Handler[]) {
      expect((await call(handler, { ...dexBody('<script>alert(1)</script>'), event: 'hub-shown' })).status).toBe(400);
    }
    expect((await call(favorites, favoriteBody('bad cid with spaces', 1))).status).toBe(400);
  });

  it('stores only a bounded number of new browsers from one network per day', async () => {
    for (let n = 0; n < 100; n++) await call(submit, dexBody(cidFor(n)));
    for (let n = 0; n < 100; n++) await call(league, leagueBody(cidFor(n)));
    for (let n = 0; n < 100; n++) await call(favorites, favoriteBody(cidFor(n), n));
    for (const key of ['clients', 'league:clients', 'favorites:clients']) {
      expect(hash(key).size).toBeGreaterThan(0);
      expect(hash(key).size).toBeLessThanOrEqual(20);
    }
    expect((await call(submit, dexBody(cidFor(0)))).status).toBe(200);
    expect((await call(submit, dexBody(cidFor(500)), { 'x-real-ip': '198.51.100.9' })).status).toBe(200);
    expect(hash('clients').has(cidFor(500))).toBe(true);
  });

  it('counts an alert when a new browser arrives near the ceiling', async () => {
    for (let n = 0; n < 40_000; n++) hash('clients').set(`filler-${n}-0000`, '{}');
    await call(submit, dexBody(cidFor(1)));
    expect(Number(hash('funnel').get('clients-near-cap:dex') ?? 0)).toBe(1);
  });
});

describe('oversized records', () => {
  it('rejects a body larger than any beacon the app sends', async () => {
    const padding = 'x'.repeat(70_000);
    expect((await call(submit, dexBody(cidFor(1), { locale: padding }))).status).toBe(413);
    expect((await call(league, { ...leagueBody(cidFor(1)), locale: padding })).status).toBe(413);
    expect((await call(favorites, { ...favoriteBody(cidFor(1), 1), locale: padding })).status).toBe(413);
  });

  it('stores each Pokémon once, in groups the app has', async () => {
    const sections: Record<string, number[]> = {};
    for (let g = 0; g < 40; g++) sections[`group-${g}`] = DEX_IDS.slice(0, 60);
    sections.starter = [1, 1, 1, 4, 7];
    sections.forest = [10, 1, 10];
    await call(submit, dexBody(cidFor(1), { sections }));
    expect(dexRecord(cidFor(1))?.latestSections).toEqual({ starter: [1, 4, 7], forest: [10] });
  });

  it('does not let the caller backdate a session by days', async () => {
    const now = Date.now();
    await call(submit, dexBody(cidFor(1), { ts: now - 3 * 86_400_000 }));
    expect(dexRecord(cidFor(1))?.sessionLog.map((s) => s.ts)).toEqual([now]);
  });
});

describe('feedback and crash eviction', () => {
  const message = (n: number) => `Real report number ${n} about the builder.`;
  const send = (handler: Handler, body: Record<string, unknown>, ip: string) =>
    call(handler, { category: 'idea', message: message(0), dwellMs: 5000, context: {}, ...body }, { 'x-real-ip': ip });

  it('keeps a known visitor’s feedback when bots flood the form', async () => {
    await call(submit, dexBody(cidFor(1)));
    await send(feedback, { cid: cidFor(1), message: 'Please add a dark mode to the builder.' }, '192.0.2.1');
    for (let hour = 0; hour < 40; hour++) {
      vi.setSystemTime(Date.UTC(2026, 10, 11, 12) + hour * 3_600_000);
      for (let n = 0; n < 250; n++) {
        await send(feedback, { cid: cidFor(10_000 + hour * 250 + n), message: message(n) }, `10.0.${hour}.${n}`);
        await send(crash, { cid: cidFor(20_000 + n), context: { error: { name: 'Error', message: `boom ${n}`, stack: 'at x' } } }, `10.1.${hour}.${n}`);
      }
    }
    const listed = await call(feedbackList, undefined, { authorization: `Bearer ${process.env.ADMIN_TOKEN}` }, 'GET');
    const items = (listed.json as { items: { message: string }[] }).items;
    expect(items.map((i) => i.message)).toContain('Please add a dark mode to the builder.');
  });
});

describe('event inflation', () => {
  it('caps how many funnel events one network adds in a day', async () => {
    const start = Date.UTC(2026, 10, 11);
    for (let n = 0; n < 1440; n++) {
      vi.setSystemTime(start + n * 60_000);
      await call(event, { cid: cidFor(n), event: 'hub-cta-dex', tool: 'hub' });
    }
    expect(Number(hash('funnel').get('hub-cta-dex'))).toBeLessThanOrEqual(600);
    expect(Number(hash('funnel').get('hub-cta-dex'))).toBeGreaterThanOrEqual(500);
  });
});

describe('archive input', () => {
  it('refuses to archive a client ID of any length', async () => {
    const auth = { authorization: `Bearer ${process.env.ADMIN_TOKEN}` };
    expect((await call(archiveEntry, { cid: 'x'.repeat(5000), archived: true }, auth)).status).toBe(400);
    expect((await call(archiveEntry, { cid: `${cidFor(1)}::US`, archived: true }, auth)).status).toBe(200);
  });
});
