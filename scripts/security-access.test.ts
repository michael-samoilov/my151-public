import {afterAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdirSync, writeFileSync, existsSync} from 'node:fs';
import {Socket} from 'node:net';
import {join} from 'node:path';
import type {VercelRequest, VercelResponse} from '@vercel/node';

const local = vi.hoisted(() => ({
  hashes: new Map<string, Record<string, unknown>>(),
  sets: new Map<string, Set<string>>(),
  dedupe: new Set<string>(),
  calls: [] as {method: string; args: unknown[]}[],
  limits: [] as {prefix: string; key: string}[],
  buckets: new Map<string, number>(),
  enforceLimit: false,
  evidence: [] as unknown[],
}));
vi.mock('@upstash/redis', () => {
  const call = (method: string, args: unknown[]) => local.calls.push({method, args});
  const hash = (key: string) => local.hashes.get(key) ?? {};
  const db = {
    async hget(key: string, field: string) {call('hget', [key, field]); return hash(key)[field] ?? null;},
    async hmget(key: string, ...fields: string[]) {call('hmget', [key, ...fields]); return Object.fromEntries(fields.map(f => [f, hash(key)[f] ?? null]));},
    async hgetall(key: string) {call('hgetall', [key]); return hash(key);},
    async hkeys(key: string) {call('hkeys', [key]); return Object.keys(hash(key));},
    async hlen(key: string) {call('hlen', [key]); return Object.keys(hash(key)).length;},
    async incr(key: string) {call('incr', [key]); const n = (local.buckets.get(`incr:${key}`) ?? 0) + 1; local.buckets.set(`incr:${key}`, n); return n;},
    async expire(...args: unknown[]) {call('expire', args); return 1;},
    async smembers(key: string) {call('smembers', [key]); return [...(local.sets.get(key) ?? [])];},
    async sadd(key: string, field: string) {call('sadd', [key, field]); const s = local.sets.get(key) ?? new Set<string>(); s.add(field); local.sets.set(key, s); return 1;},
    async srem(key: string, field: string) {call('srem', [key, field]); return local.sets.get(key)?.delete(field) ? 1 : 0;},
    async lrange(...args: unknown[]) {call('lrange', args); return [];},
    async llen(...args: unknown[]) {call('llen', args); return 0;},
    async hscan(key: string, cursor: string|number, options?: {count?: number}) {
      call('hscan', [key, cursor, options]);
      const entries = Object.entries(hash(key)), start = Number(cursor), end = start + (options?.count ?? 10);
      return [end >= entries.length ? '0' : String(end), entries.slice(start, end).flat()];
    },
    async mget(...args: unknown[]) {call('mget', args); return [null, null];},
    async mset(...args: unknown[]) {call('mset', args); return 'OK';},
    async eval(script: string, keys: string[], args: (string|number)[]) {
      call('eval', [keys, args]);
      if (!script.includes("local cur = redis.call('HGET'")) return [];
      const [cid, version, record] = args.map(String);
      if (keys.length > 2 && local.dedupe.has(keys[2])) return 2;
      if (String(hash(keys[1])[cid] ?? 0) !== version) return 0;
      local.hashes.set(keys[0], {...hash(keys[0]), [cid]: JSON.parse(record)});
      local.hashes.set(keys[1], {...hash(keys[1]), [cid]: Number(version) + 1});
      if (keys.length > 2) local.dedupe.add(keys[2]);
      return 1;
    },
  };
  return {Redis: class {constructor() {return db;}}};
});
vi.mock('@upstash/ratelimit', () => ({Ratelimit: class {
  prefix: string;
  constructor(options: {prefix: string}) {this.prefix = options.prefix;}
  static fixedWindow() {return {};}
  async limit(key: string) {
    local.limits.push({prefix: this.prefix, key});
    const bucket = `${this.prefix}:${key}`, n = (local.buckets.get(bucket) ?? 0) + 1;
    local.buckets.set(bucket, n);
    return {success: !local.enforceLimit || n <= 60, reset: Date.now() + 60_000};
  }
}}));
vi.mock('../api/_searchPerformance.js', () => {
  const part = (hourly = false) => ({generatedAt: new Date().toISOString(), providers: Object.fromEntries((hourly ? ['google'] : ['google', 'bing']).map(provider => [provider, {provider, status: 'not_configured', series: [], ranges: {}}]))});
  return {buildDailySearchSnapshot: async () => part(), buildHourlySearchSnapshot: async () => part(true)};
});
vi.mock('../api/_exportStats.js', () => ({
  parseNotmeFlag: (v: unknown) => v === true || v === 1 || v === '1',
  parsePokemonIds: () => [], bumpDexPickFreq: async () => {}, recordToolExport: async () => ({fixture: true}),
}));
import submissions from '../api/submissions';
import journal from '../api/journal';
import feedbackList from '../api/feedback-list';
import search from '../api/search-performance';
import history from '../api/activity-history';
import archive from '../api/archive-entry';
import maintenance from '../api/admin-maintenance';
import submit from '../api/submit';
import league from '../api/league';
import favorites from '../api/favorites';
import event from '../api/event';
import {getNetworkKey, requireAdmin} from '../api/_shared';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;
const token = randomUUID();
const fixedNow = Date.UTC(2026, 9, 16, 12);
const cid = 'fixture-victim-00000001';
const adminRoutes: [string, Handler][] = [
  ['submissions', submissions], ['journal', journal], ['feedback-list', feedbackList],
  ['search-performance', search], ['activity-history', history],
];
async function request(name: string, handler: Handler, input: {method?: string; headers?: Record<string, string|string[]>; query?: Record<string, string>; body?: unknown} = {}) {
  const callStart = local.calls.length, limitStart = local.limits.length;
  let status = 200, body: unknown;
  const headers: Record<string, unknown> = {};
  const res = {status(code: number) {status = code; return this;}, json(value: unknown) {body = value; return this;}, setHeader(key: string, value: unknown) {headers[key.toLowerCase()] = value; return this;}};
  const req = {method: input.method ?? 'GET', headers: {host: 'my151.app', 'x-real-ip': '192.0.2.10', ...input.headers}, query: input.query ?? {}, body: input.body, socket: {remoteAddress: '192.0.2.10'}};
  await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
  const safe = JSON.parse(JSON.stringify(req).replaceAll(token, '[generated fake token]'));
  local.evidence.push({route: `/api/${name}`, request: safe, response: {status, headers, body}, redisCalls: local.calls.slice(callStart).map(c => ({method: c.method, args: c.args})), limiterCalls: local.limits.slice(limitStart)});
  return {status, headers, body};
}
const bearer = () => ({authorization: `Bearer ${token}`});
beforeEach(() => {
  vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(fixedNow);
  vi.stubEnv('ADMIN_TOKEN', token);
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://fixture.invalid');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'fixture-token-only');
  for (const key of ['UPSTASH_MGMT_EMAIL', 'UPSTASH_MGMT_API_KEY', 'UPSTASH_DB_ID']) vi.stubEnv(key, '');
  vi.stubGlobal('fetch', vi.fn(() => {throw Error('Network disabled for this review');}));
  vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => {throw Error('Socket network disabled for this review');});
  local.hashes.clear(); local.sets.clear(); local.dedupe.clear(); local.calls = []; local.limits = []; local.buckets.clear(); local.enforceLimit = false;
});
afterAll(() => {
  const output = process.env.SECURITY_ACCESS_EVIDENCE_DIR;
  if (output) {
  mkdirSync(output, {recursive: true});
  writeFileSync(join(output, 'requests-responses.json'), JSON.stringify({base: '40aceaf91e2262f93dff843ebe9128ce0bc93e68', fixtureTime: new Date(fixedNow).toISOString(), safety: 'Handler calls only. Mocked Redis/limiter. Global fetch and Socket.connect throw. Generated fake token redacted.', cases: local.evidence}, null, 2) + '\n');
  }
  vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
});

describe('Admin read authorization attacks', () => {
  for (const [name, handler] of adminRoutes) {
    for (const [attack, headers, query] of [
      ['missing token', {}, {}],
      ['wrong token', {authorization: 'Bearer wrong-fixture-token'}, {}],
      ['query token', {}, {token}],
      ['role escalation', {'x-admin': 'true', 'x-role': 'admin', cookie: 'role=admin'}, {admin: '1', role: 'admin'}],
      ['Basic scheme', {authorization: `Basic ${token}`}, {}],
      ['prefix only', {authorization: 'Bearer '}, {}],
      ['duplicate wrong-first', {authorization: ['Bearer wrong', `Bearer ${token}`]}, {}],
    ] as [string, Record<string,string|string[]>, Record<string,string>][]) {
      it(`${name}: rejects ${attack} before private reads`, async () => {
        expect((await request(name, handler, {headers, query})).status).toBe(401);
        expect(local.calls).toHaveLength(0);
        expect(local.limits).toHaveLength(1);
      });
    }
    it(`${name}: accepts generated bearer and records its cache header`, async () => {
      const result = await request(name, handler, {headers: bearer()});
      expect(result.status).toBe(200);
      expect(result.headers['cache-control']).toBe('no-store');
    });
  }
  it('cid and country selectors do not bypass the owner gate', async () => {
    expect((await request('submissions', submissions, {query: {cid, country: 'US'}})).status).toBe(401);
    expect(local.calls).toHaveLength(0);
  });
  it('usage management stats remain behind the owner gate', async () => {
    expect((await request('submissions', submissions, {query: {usage: '1', activity: '1'}})).status).toBe(401);
    expect(local.calls).toHaveLength(0);
  });
  it('missing configured admin token fails closed', async () => {
    vi.stubEnv('ADMIN_TOKEN', '');
    expect((await request('submissions', submissions, {headers: bearer()})).status).toBe(503);
    expect(local.calls).toHaveLength(0); expect(local.limits).toHaveLength(0);
  });
  it('old bearer fails after token rotation; current bearer can be reused', async () => {
    await request('submissions', submissions, {headers: bearer()});
    const replacement = randomUUID(); vi.stubEnv('ADMIN_TOKEN', replacement);
    expect((await request('submissions', submissions, {headers: bearer()})).status).toBe(401);
    const replacementHandler: Handler = async (req, res) => {if (await requireAdmin(req, res)) res.status(200).json({ok: true});};
    const replacementHeaders = {authorization: `Bearer ${replacement}`};
    const res = {status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn()};
    for (let n = 0; n < 2; n++) await replacementHandler({headers: replacementHeaders, socket: {remoteAddress: '192.0.2.10'}} as unknown as VercelRequest, res as unknown as VercelResponse);
    expect(res.status).toHaveBeenLastCalledWith(200);
  });
  it('an unauthenticated request invokes the paid limiter path before rejection', async () => {
    for (let n = 0; n < 3; n++) expect((await request('submissions', submissions)).status).toBe(401);
    expect(local.limits).toHaveLength(3);
  });
  it('shared-IP unauthenticated requests consume the admin allowance in a modeled fixed window', async () => {
    local.enforceLimit = true;
    for (let n = 0; n < 60; n++) await request('submissions', submissions);
    expect((await request('submissions', submissions, {headers: bearer()})).status).toBe(429);
    expect(local.calls).toHaveLength(0);
  });
  it('x-real-ip takes precedence over attacker-supplied forwarding values', async () => {
    await request('submissions', submissions, {headers: {'x-forwarded-for': '198.51.100.42'}});
    expect(local.limits[0].key).toBe(getNetworkKey({headers: {'x-real-ip': '192.0.2.10'}} as unknown as VercelRequest));
    expect(local.limits[0].key).not.toContain('192.0.2.10');
  });
});

describe('Admin writes and removed destructive routes', () => {
  it('role flags cannot archive a browser', async () => {
    expect((await request('archive-entry', archive, {method: 'POST', body: {cid, archived: true, role: 'admin'}, headers: {'x-role': 'admin'}})).status).toBe(401);
    expect(local.calls).toHaveLength(0);
  });
  it('owner bearer can archive and restore only in the mocked store', async () => {
    for (const archived of [true, false]) {
      expect((await request('archive-entry', archive, {method: 'POST', headers: bearer(), body: {cid, archived}})).status).toBe(200);
      expect(local.sets.get('clients:archived')?.has(cid) ?? false).toBe(archived);
    }
  });
  it('role flags cannot run data upkeep', async () => {
    expect((await request('admin-maintenance', maintenance, {method: 'POST', body: {task: 'funnel-retention'}, headers: {'x-role': 'admin'}})).status).toBe(401);
    expect(local.calls).toHaveLength(0);
  });
  it('owner bearer runs only a named upkeep task, and it touches only day counters', async () => {
    expect((await request('admin-maintenance', maintenance, {method: 'POST', headers: bearer(), body: {task: 'reset'}})).status).toBe(400);
    expect(local.calls).toHaveLength(0);
    expect((await request('admin-maintenance', maintenance, {method: 'POST', headers: bearer(), body: {task: 'funnel-retention'}})).status).toBe(200);
    expect(local.calls.map(c => c.method)).toEqual(['eval']);
    const [keys] = local.calls[0].args as [string[]];
    expect(keys.every(k => /^funnel:\d{4}-\d{2}-\d{2}$/.test(k))).toBe(true);
  });
  it('removed reset and delete endpoints have no callable source route', () => {
    expect(existsSync('api/reset.ts')).toBe(false);
    expect(existsSync('api/delete-entry.ts')).toBe(false);
  });
});

describe('Anonymous cid ownership: known-id integrity attacks', () => {
  it('Dex: a second unauthenticated caller can replace another cid’s latest analytics build', async () => {
    const first = {cid, kind: 'progress', ids: [1], ts: fixedNow - 1000};
    expect((await request('submit', submit, {method: 'POST', body: first})).status).toBe(200);
    const before = structuredClone(local.hashes.get('clients')?.[cid]);
    expect((await request('submit', submit, {method: 'POST', body: {...first, ids: [4], ts: fixedNow}, headers: {'x-real-ip': '198.51.100.20'}})).status).toBe(200);
    expect(before).toMatchObject({latestIds: [1]});
    expect(local.hashes.get('clients')?.[cid]).toMatchObject({latestIds: [4], submits: 2});
    expect((await request('submissions', submissions, {query: {cid}})).status).toBe(401);
  });
  it('League: a second unauthenticated caller can replace another cid’s analytics summary', async () => {
    const first = {cid, kind: 'progress', summary: {cards: 1, seats: 1, typed: 0, named: 0, aces: 0}, ts: fixedNow - 1000};
    expect((await request('league', league, {method: 'POST', body: first})).status).toBe(200);
    expect((await request('league', league, {method: 'POST', body: {...first, summary: {...first.summary, cards: 2}, ts: fixedNow}, headers: {'x-real-ip': '198.51.100.20'}})).status).toBe(200);
    expect(local.hashes.get('league:clients')?.[cid]).toMatchObject({submits: 2, latest: {cards: 2}});
  });
  it('Picker: a second unauthenticated caller can replace another cid’s analytics snapshot', async () => {
    const first = {cid, id: 'fixture-request-1', kind: 'progress', snapshot: {v: 1, fills: {'water|1': 7}}, ts: fixedNow - 1000};
    expect((await request('favorites', favorites, {method: 'POST', body: first})).status).toBe(200);
    expect((await request('favorites', favorites, {method: 'POST', body: {...first, id: 'fixture-request-2', snapshot: {v: 1, fills: {'fire|1': 4}}, ts: fixedNow}, headers: {'x-real-ip': '198.51.100.20'}})).status).toBe(200);
    expect(local.hashes.get('favorites:clients')?.[cid]).toMatchObject({submits: 2, seenIds: ['fixture-request-1', 'fixture-request-2'], latest: {fills: {'fire|1': 4}, filled: 1}});
  });
  it('the owner can read a synthetic browser while an outsider cannot read the same cid', async () => {
    await request('submit', submit, {method: 'POST', body: {cid, kind: 'progress', ids: [25]}});
    const owner = await request('submissions', submissions, {headers: bearer(), query: {cid}});
    expect(owner.status).toBe(200);
    expect(JSON.stringify(owner.body)).toContain('25');
    expect((await request('submissions', submissions, {query: {cid}})).status).toBe(401);
  });
  it('a cid containing a country suffix is refused, so it cannot write a legacy country-keyed Dex field', async () => {
    const suffixed = `${cid}::US`;
    expect((await request('submit', submit, {method: 'POST', body: {cid: suffixed, kind: 'progress', ids: [1]}})).status).toBe(400);
    expect(local.hashes.get('clients')?.[suffixed]).toBeUndefined();
  });
});

describe('Automated browsers', () => {
  const day = new Date(fixedNow).toISOString().slice(0, 10);
  const activity = {v: 1, batches: [{id: 'batch-0001', tab: 'tab-00001', day, buckets: [{run: 'run-00001', first: fixedNow - 60_000, last: fixedNow - 60_000}]}]};
  const beacons: [string, Handler, Record<string, unknown>][] = [
    ['submit', submit, {cid, kind: 'progress', ids: [1], ts: fixedNow, activity}],
    ['league', league, {cid, kind: 'progress', summary: {cards: 1, seats: 1, typed: 0, named: 0, aces: 0}, ts: fixedNow, activity}],
    ['favorites', favorites, {cid, id: 'fixture-request-1', kind: 'progress', snapshot: {v: 1, fills: {}}, ts: fixedNow, activity}],
    ['event', event, {cid, event: 'intro-shown', tool: 'dex'}],
  ];
  for (const [name, handler, body] of beacons) {
    it(`${name}: answers an auto-flagged beacon as accepted and stores nothing`, async () => {
      const result = await request(name, handler, {method: 'POST', body: {...body, auto: true}});
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ok: true, ...(body.activity ? {activityAck: {status: 'recorded', accepted: ['batch-0001']}} : {})});
      expect(local.calls).toEqual([]);
    });
  }
});
