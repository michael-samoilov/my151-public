import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { VercelRequest, VercelResponse } from '../api/_vercel';

const fixture = vi.hoisted(() => {
  const counters = new Map<string, number>();
  const hashes = new Map<string, Record<string, unknown>>();
  const writes: { method: string; args: unknown[] }[] = [];
  const redis = {
    evalsha: async (_hash: string, keys: string[], args: number[]) => {
      const count = (counters.get(keys[0]) ?? 0) + Number(args[2]);
      counters.set(keys[0], count);
      return [count, Number(args[0])];
    },
    eval: async (lua: string, keys: string[], args: unknown[]) => {
      if (lua.includes('ipairs(KEYS)') && lua.includes("'HEXISTS'")) return keys.some((key) => String(args[0]) in (hashes.get(key) ?? {})) ? 1 : 0;
      writes.push({ method: 'eval', args: [keys, args] });
      if (keys[0] === 'clients' || keys[0] === 'league:clients') {
        const hash = hashes.get(keys[0]) ?? {};
        hash[String(args[0])] = args[2];
        hashes.set(keys[0], hash);
      }
      return 1;
    },
    hget: async (key: string, field: string) => hashes.get(key)?.[field] ?? null,
    hlen: async (key: string) => Object.keys(hashes.get(key) ?? {}).length,
    incr: async (key: string) => {
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      return count;
    },
  } as Record<string, unknown>;
  const writeMethods = ['hincrby', 'hset', 'rpush', 'lpush', 'expire', 'ltrim'];
  for (const method of writeMethods) {
    redis[method] = async (...args: unknown[]) => { writes.push({ method, args }); return 1; };
  }
  redis.pipeline = () => {
    const queued: [string, unknown[]][] = [];
    const chain: Record<string, unknown> = {
      exec: async () => {
        const results: unknown[] = [];
        for (const [method, args] of queued) results.push(await (redis[method] as (...a: unknown[]) => Promise<unknown>)(...args));
        return results;
      },
    };
    for (const method of writeMethods) chain[method] = (...args: unknown[]) => { queued.push([method, args]); return chain; };
    return chain;
  };
  return { redis, counters, hashes, writes };
});

vi.mock('@upstash/redis', () => ({ Redis: class { constructor() { return fixture.redis; } } }));

import submit from '../api/submit';
import league from '../api/league';
import favorites from '../api/favorites';
import feedback from '../api/feedback';
import crash from '../api/crash';
import event from '../api/event';
import { createHash } from 'node:crypto';
import { getNetworkKey } from '../api/_shared';
import { FEEDBACK_MESSAGE_MAX_CHARS } from '../src/lib/feedbackLimits';
import { recordToolExport } from '../api/_exportStats';

type Handler = typeof feedback;
type Evidence = { name: string; request: unknown; response: unknown; storageWrites: number; finding?: string };
const evidence: Evidence[] = [];
const cid = 'security-local-fixture';
const validFeedback = { cid, category: 'bug', message: 'Local test only', dwellMs: 2500 };
let sequence = 0;

async function call(handler: Handler, body: unknown, options: { name?: string; ip?: string; host?: string; method?: string; headers?: Record<string, string> } = {}) {
  const before = fixture.writes.length;
  const headers: Record<string, unknown> = {};
  let status = 0;
  let json: unknown;
  const res = {
    status(code: number) { status = code; return res; },
    json(value: unknown) { json = value; return res; },
    setHeader(name: string, value: unknown) { headers[name] = value; return res; },
  };
  const req = { method: options.method ?? 'POST', body,
    headers: { host: options.host ?? 'my151.app', 'x-real-ip': options.ip ?? `local-${sequence++}`, ...options.headers },
    socket: { remoteAddress: '127.0.0.1' } };
  await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
  const response = { status, body: json, headers };
  const storageWrites = fixture.writes.length - before;
  if (options.name) evidence.push({ name: options.name, request: { method: req.method, body, headers: req.headers }, response, storageWrites });
  return { ...response, storageWrites };
}

function networkKeyOf(ip: string): string {
  return getNetworkKey({ headers: { 'x-real-ip': ip } } as unknown as VercelRequest);
}

function seedLimit(prefix: string, identifier: string, period: number, used: number) {
  fixture.counters.set(`${prefix}:${identifier}:${Math.floor(Date.now() / period)}`, used);
}

beforeAll(() => {
  vi.stubEnv('ADMIN_TOKEN', 'local-fixture-token');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubGlobal('fetch', () => { throw new Error('Network forbidden in local security probes'); });
});

afterAll(() => {
  const phase = process.env.SECURITY_EVIDENCE_PHASE;
  const directory = phase === 'before' || phase === 'after' ? 'docs/evidence/security-review-2026-10-16' : '.audit/security-review';
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/limits-${phase === 'before' || phase === 'after' ? phase : 'latest'}-results.json`, JSON.stringify({
    environment: 'Local handler calls. Real SDK limiter. In-memory Redis command fixture. Network forbidden.',
    limitations: 'No HTTP platform parser, live Redis Lua execution, Vercel header normalization, or real users tested.',
    cases: evidence,
  }, null, 2) + '\n');
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('local adversarial API limits and validation', () => {
  it('rejects malformed field types and oversized feedback before writes', async () => {
    for (const [name, body] of [
      ['empty object', {}], ['empty message', { ...validFeedback, message: '' }],
      ['long message', { ...validFeedback, message: 'x'.repeat(FEEDBACK_MESSAGE_MAX_CHARS + 1) }],
      ['negative dwell', { ...validFeedback, dwellMs: -10 }],
      ['object message', { ...validFeedback, message: { role: 'admin' } }],
      ['JSON text passed unparsed', '{"category":'],
      ['negative Pokemon ID', { cid, kind: 'progress', ids: [-1] }],
      ['duplicate Pokemon IDs', { cid, kind: 'progress', ids: [1, 1] }],
      ['empty Pokemon IDs', { cid, kind: 'progress', ids: [] }],
      ['long CID', { cid: 'x'.repeat(65), kind: 'progress', ids: [1] }],
    ] as const) {
      const handler = name.includes('Pokemon') || name === 'long CID' ? submit : feedback;
      const result = await call(handler, body, { name });
      expect(result.status).toBe(400);
      expect(result.storageWrites).toBe(0);
    }
  });

  it('allows direct feedback without UI but enforces dwell and strips unknown context', async () => {
    const result = await call(feedback, { ...validFeedback, context: { role: 'admin', placed: -10, dpr: -8 }, role: 'admin' }, { name: 'direct API skips UI' });
    expect(result.status).toBe(200);
    const last = fixture.writes.filter(w => w.method === 'lpush').at(-1)!;
    const stored = JSON.parse(String(last.args[1]));
    expect(stored.context).toMatchObject({ placed: 0, dpr: 0 });
    expect(stored).not.toHaveProperty('role');
    expect(stored.context).not.toHaveProperty('role');
    evidence.push({ name: 'stored context allow-list', request: { role: 'admin', placed: -10, dpr: -8 }, response: stored.context, storageWrites: 0 });
  });

  it('silently drops honeypot submissions', async () => {
    const result = await call(feedback, { ...validFeedback, website: 'bot.example' }, { name: 'hidden honeypot supplied' });
    expect(result.status).toBe(200);
    expect(result.storageWrites).toBe(0);
  });

  it('refuses 19 of 20 simultaneous feedback requests with one IP allowance left', async () => {
    const ip = 'local-concurrent-ip';
    seedLimit('rl:fbip', networkKeyOf(ip), 600_000, 4);
    const results = await Promise.all(Array.from({ length: 20 }, () => call(feedback, validFeedback, { ip })));
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect(results.filter(r => r.status === 429)).toHaveLength(19);
    evidence.push({ name: '20 parallel requests, one IP token left', request: { endpoint: '/api/feedback', count: 20, priorUsage: 4, cap: 5 },
      response: results.map(r => ({ status: r.status, body: r.body })), storageWrites: results.reduce((n, r) => n + (r.status === 200 ? 1 : 0), 0) });
  });

  it('refuses direct API calls after CID allowance exhaustion', async () => {
    seedLimit('rl:fbclient', 'exhausted-local-cid', 86_400_000, 10);
    const result = await call(feedback, { ...validFeedback, cid: 'exhausted-local-cid' }, { name: 'direct API after feedback daily limit' });
    expect(result.status).toBe(429);
    expect(result.storageWrites).toBe(0);
  });

  it('refuses spoofed tool budgets after the dex CID allowance is exhausted', async () => {
    const limitCid = 'local-tool-budget-cid';
    seedLimit('rl:client', `dex:${limitCid}`, 86_400_000, 3000);
    const denied = await call(submit, { cid: limitCid, kind: 'progress', ids: [1], tool: 'dex' }, { name: 'exhausted dex daily budget' });
    const spoofed = [];
    for (const tool of ['hub', 'league', 'favorites']) {
      spoofed.push(await call(submit, { cid: limitCid, kind: 'progress', ids: [1], tool }, { name: `changed tool ${tool} after dex daily budget` }));
    }
    expect(denied.status).toBe(429);
    expect(spoofed.map(result => result.status)).toEqual([429, 429, 429]);
  });

  it('leaves all six write handlers inert on ordinary preview hosts', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    const cases: [string, Handler, unknown][] = [
      ['feedback', feedback, validFeedback],
      ['crash', crash, { cid, context: { error: { message: 'local crash' } } }],
      ['event', event, { cid, event: 'hub-shown' }],
      ['submit', submit, { cid, kind: 'progress', ids: [1] }],
      ['submit export', submit, { cid, kind: 'export', ids: [1] }],
      ['league', league, { cid, kind: 'progress', summary: { cards: 1, seats: 1, typed: 0, named: 0, aces: 0 } }],
      ['league export', league, { cid, kind: 'export', exportKind: 'league', pokemonIds: [1], summary: { cards: 1, seats: 1, typed: 0, named: 0, aces: 0 } }],
      ['favorites', favorites, { cid, id: 'local-request-id', kind: 'progress', snapshot: { v: 1, fills: {} } }],
    ];
    for (const [name, handler, body] of cases) {
      const countersBefore = JSON.stringify([...fixture.counters]);
      const result = await call(handler, body, { name: `${name} preview write guard`, host: 'local-preview.vercel.app' });
      expect(result.status).toBe(200);
      expect(result.storageWrites).toBe(0);
      expect(JSON.stringify([...fixture.counters])).toBe(countersBefore);
    }
    const before = fixture.writes.length;
    expect(await recordToolExport('pokedex', [1])).toMatchObject({ ordinal: 151 });
    expect(fixture.writes.length).toBe(before);
    evidence.push({ name: 'direct preview export recorder', request: { tool: 'pokedex', pokemonIds: [1] }, response: { ordinal: 151 }, storageWrites: 0 });
    vi.stubEnv('VERCEL_ENV', 'production');
  });

  it('prefers trusted x-real-ip over client-supplied forwarded chain', () => {
    const req = { headers: { 'x-real-ip': '192.0.2.10', 'x-forwarded-for': '198.51.100.2' } } as unknown as VercelRequest;
    expect(getNetworkKey(req)).toBe(networkKeyOf('192.0.2.10'));
    expect(getNetworkKey(req)).not.toBe(networkKeyOf('198.51.100.2'));
    evidence.push({ name: 'IP selection', request: req, response: { networkKey: getNetworkKey(req) }, storageWrites: 0 });
  });

  it('stores only a keyed hash of the network, never the address or its plain hash', () => {
    vi.stubEnv('ADMIN_TOKEN', 'first-server-secret');
    const key = networkKeyOf('192.0.2.10');
    expect(key).not.toContain('192.0.2.10');
    expect(key).not.toBe(createHash('sha256').update('192.0.2.10').digest('hex').slice(0, 24));
    expect(networkKeyOf('192.0.2.10')).toBe(key);
    expect(networkKeyOf('2001:db8:1:2::5')).toBe(networkKeyOf('2001:db8:1:2:ffff::9'));
    vi.stubEnv('ADMIN_TOKEN', 'second-server-secret');
    expect(networkKeyOf('192.0.2.10')).not.toBe(key);
  });
});
