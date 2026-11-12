import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

import retention from '../api/retention';
import { FORGET_BROWSERS, PERSIST_TOTALS, RETIRE_RECORDS } from '../api/_retention';
import { READ_RETENTION, readRetention } from '../api/_retiredTally';
import { buildDashboard } from '../api/_dashboard';

const NOW = Date.UTC(2027, 5, 20, 4, 17);
const THIRTEEN_MONTHS_AND_A_DAY = Date.UTC(2026, 4, 19, 4, 17);
const TWELVE_MONTHS = Date.UTC(2026, 5, 20, 4, 17);
const DAY = 86_400_000;
const SECRET = 'retention-cron-fixture-secret';

const db = {
  hashes: new Map<string, Map<string, string>>(),
  sets: new Map<string, Set<string>>(),
  strings: new Map<string, string>(),
  expiring: new Set<string>(),
};
const hash = (key: string) => db.hashes.get(key) ?? db.hashes.set(key, new Map()).get(key)!;
const hincr = (key: string, field: string) => hash(key).set(field, String(Number(hash(key).get(field) ?? 0) + 1));
const held = (cid: string, tools: string[]) => tools.some((key) => hash(key).has(cid));
const exists = (key: string) => (db.hashes.get(key)?.size ?? 0) > 0 || db.sets.has(key) || db.strings.has(key);

function runScript(script: string, keys: string[], args: string[]): unknown {
  if (script === RETIRE_RECORDS) {
    let retired = 0;
    for (let i = 1; i < args.length;) {
      const [cid, nTool, nAll] = [args[i], Number(args[i + 1]), Number(args[i + 2])];
      const fields = args.slice(i + 3, i + 3 + nTool + nAll);
      i += 3 + nTool + nAll;
      const raw = hash(keys[0]).get(cid);
      const lastTs = raw ? (JSON.parse(raw) as { lastTs?: unknown }).lastTs : undefined;
      if (typeof lastTs !== 'number' || lastTs >= Number(args[0]) || !hash(keys[0]).delete(cid)) continue;
      hash(keys[1]).delete(cid);
      fields.forEach((field, j) => hincr(j < nTool ? keys[2] : keys[3], field));
      retired++;
    }
    return retired;
  }
  if (script === FORGET_BROWSERS) {
    return args.slice(1).filter((cid) => !held(cid, keys.slice(1)) && (args[0] === 'set' ? db.sets.get(keys[0])?.delete(cid) : hash(keys[0]).delete(cid))).length;
  }
  if (script === PERSIST_TOTALS) return keys.filter((key) => exists(key) && db.expiring.delete(key)).length;
  if (script === READ_RETENTION) {
    return [...keys.slice(0, -1).map((key) => [...hash(key)].flat()), db.strings.get(keys.at(-1)!) ?? ''];
  }
  throw new Error('unexpected script');
}

function command([name, ...rest]: string[]): unknown {
  switch (name.toLowerCase()) {
    case 'eval': {
      const n = Number(rest[1]);
      return runScript(rest[0], rest.slice(2, 2 + n), rest.slice(2 + n));
    }
    case 'hscan': {
      const entries = [...hash(rest[0])], start = Number(rest[1]), end = start + 2;
      return [end >= entries.length ? '0' : String(end), entries.slice(start, end).flat()];
    }
    case 'smembers':
      return [...(db.sets.get(rest[0]) ?? [])];
    case 'set': {
      const [key, value, ...opts] = rest;
      if (opts.map((o) => o.toLowerCase()).includes('nx') && db.strings.has(key)) return null;
      db.strings.set(key, value);
      return 'OK';
    }
    case 'del':
      return db.strings.delete(rest[0]) ? 1 : 0;
    default:
      throw new Error(`unexpected command ${name}`);
  }
}

const encode = (v: unknown): unknown => (typeof v === 'string' && v !== 'OK' ? Buffer.from(v).toString('base64') : Array.isArray(v) ? v.map(encode) : v);

function dexRecord(cid: string, lastTs: number, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    cid, firstTs: lastTs - 30 * DAY, firstAt: '', lastTs, lastAt: '', submits: 1, sessions: 1,
    sessionMs: [60_000], sessionLog: [{ ts: lastTs, ids: [1, 4, 7] }], maxDepth: 3, localHour: 12,
    country: 'US', device: 'Mobile', everIds: [1, 4, 7], latestIds: [1, 4, 7], completed: false, exported: false, ...extra,
  });
}

function leagueRecord(cid: string, lastTs: number) {
  const summary = { cards: 1, seats: 2, typed: 0, named: 0, aces: 0, leagueNamed: false };
  return JSON.stringify({
    cid, firstTs: lastTs, firstAt: '', lastTs, lastAt: '', submits: 1, sessions: 1, curSessionStart: lastTs,
    maxSessionMs: 60_000, sessionMs: [60_000], sessionLog: [{ ts: lastTs, summary }], maxCards: 1, maxSeats: 2, latest: summary,
    exportsCard: 0, exportsLeague: 0, country: 'DE', device: 'Desktop',
  });
}

async function call(headers: Record<string, string> = { authorization: `Bearer ${SECRET}` }, host = 'my151.app') {
  let status = 0;
  let body: unknown;
  const res = { status(code: number) { status = code; return res; }, json(value: unknown) { body = value; return res; }, setHeader() { return res; } };
  await retention({ method: 'GET', headers: { host, ...headers }, query: {} } as unknown as VercelRequest, res as unknown as VercelResponse);
  return { status, body };
}

const tally = (slice: string) => Object.fromEntries(hash(`retired:${slice}`));

beforeEach(() => {
  db.hashes.clear(); db.sets.clear(); db.strings.clear(); db.expiring.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('CRON_SECRET', SECRET);
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as string[] | string[][];
    const reply = (cmd: string[]) => ({ result: encode(command(cmd.map(String))) });
    return new Response(JSON.stringify(Array.isArray(body[0]) ? (body as string[][]).map(reply) : reply(body as string[])));
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('retention job', () => {
  it('deletes a record and its version 13 months and a day after its last visit, and counts it in the anonymous tallies', async () => {
    hash('clients').set('old-browser-0001', dexRecord('old-browser-0001', THIRTEEN_MONTHS_AND_A_DAY));
    hash('clients:ver').set('old-browser-0001', '4');

    expect((await call()).status).toBe(200);

    expect(hash('clients').has('old-browser-0001')).toBe(false);
    expect(hash('clients:ver').has('old-browser-0001')).toBe(false);
    const counted = { total: '1', 'first:2026-04': '1', 'country:US': '1', 'device:Mobile': '1' };
    expect(tally('dex')).toEqual(counted);
    expect(tally('all')).toEqual(counted);
    expect(JSON.parse(db.strings.get('retention:last-run')!)).toEqual({
      at: new Date(NOW).toISOString(), retired: { dex: 1, league: 0, favorites: 0 }, persisted: 0,
    });
    expect(db.strings.has('retention:lock')).toBe(false);
  });

  it('keeps a record whose last visit is 12 months old', async () => {
    hash('clients').set('recent-browser-01', dexRecord('recent-browser-01', TWELVE_MONTHS));
    hash('clients:ver').set('recent-browser-01', '2');

    await call();

    expect(hash('clients').has('recent-browser-01')).toBe(true);
    expect(hash('clients:ver').get('recent-browser-01')).toBe('2');
    expect(tally('dex')).toEqual({});
  });

  it('counts nothing twice when the job runs again or overlaps a running job', async () => {
    hash('clients').set('old-browser-0001', dexRecord('old-browser-0001', THIRTEEN_MONTHS_AND_A_DAY));
    await call();
    await call();
    expect(tally('dex').total).toBe('1');

    db.strings.set('retention:lock', 'another run');
    hash('clients').set('old-browser-0002', dexRecord('old-browser-0002', THIRTEEN_MONTHS_AND_A_DAY));
    expect((await call()).body).toEqual({ ok: true, skipped: 'another run holds the lock' });
    expect(hash('clients').has('old-browser-0002')).toBe(true);
  });

  it('counts a browser in the All tally only when its last engaged record goes', async () => {
    hash('clients').set('two-tool-browser', dexRecord('two-tool-browser', THIRTEEN_MONTHS_AND_A_DAY));
    hash('league:clients').set('two-tool-browser', leagueRecord('two-tool-browser', TWELVE_MONTHS));
    await call();
    expect(tally('dex').total).toBe('1');
    expect(tally('all')).toEqual({});

    vi.setSystemTime(TWELVE_MONTHS + 13 * 31 * DAY);
    await call();
    expect(tally('league')).toEqual({ total: '1', 'first:2026-06': '1', 'country:DE': '1', 'device:Desktop': '1' });
    expect(tally('all')).toEqual({ total: '1', 'first:2026-06': '1', 'country:DE': '1', 'device:Desktop': '1' });
  });

  it('deletes an archived browser without counting it, then its archive mark and survey skips, and keeps a recent skip', async () => {
    hash('clients').set('owner-browser-01', dexRecord('owner-browser-01', THIRTEEN_MONTHS_AND_A_DAY));
    db.sets.set('clients:archived', new Set(['owner-browser-01']));
    hash('export-survey-skips').set('owner-browser-01', JSON.stringify([{ t: THIRTEEN_MONTHS_AND_A_DAY, tool: 'pokedex', reason: 'not_now' }]));
    hash('export-survey-skips').set('capped-browser01', JSON.stringify([{ t: NOW - DAY, tool: 'pokedex', reason: 'not_now' }]));

    expect((await call()).body).toMatchObject({ forgotten: { skips: 1, archived: 1, backups: 0 } });

    expect(hash('clients').size).toBe(0);
    expect(tally('dex')).toEqual({});
    expect(db.sets.get('clients:archived')?.size).toBe(0);
    expect([...hash('export-survey-skips').keys()]).toEqual(['capped-browser01']);
  });

  it('removes the end date from anonymous daily totals written before the change', async () => {
    const day = new Date(NOW - 10 * DAY).toISOString().slice(0, 10);
    for (const key of [`funnel:${day}`, `visits:${day}`, `feedback:count:${day}`]) {
      hash(key).set('all', '3');
      db.expiring.add(key);
    }

    await call();

    expect(db.expiring.size).toBe(0);
    expect(JSON.parse(db.strings.get('retention:last-run')!).persisted).toBe(3);
  });
});

describe('retention route', () => {
  it('refuses with 503 when CRON_SECRET is unset and 401 for a wrong token, and changes nothing', async () => {
    hash('clients').set('old-browser-0001', dexRecord('old-browser-0001', THIRTEEN_MONTHS_AND_A_DAY));
    vi.stubEnv('CRON_SECRET', '');
    expect((await call()).status).toBe(503);
    vi.stubEnv('CRON_SECRET', SECRET);
    expect((await call({ authorization: 'Bearer wrong-secret' })).status).toBe(401);
    expect((await call({})).status).toBe(401);
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect((await call({ authorization: `Bearer ${SECRET}` }, 'my151-git-preview.vercel.app')).body).toEqual({ ok: true, skipped: 'not a production deployment' });
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(hash('clients').has('old-browser-0001')).toBe(true);
    expect(db.strings.size).toBe(0);
  });

  it('runs when the production cron calls the vercel.app address', async () => {
    hash('clients').set('old-browser-0001', dexRecord('old-browser-0001', THIRTEEN_MONTHS_AND_A_DAY));
    expect((await call({ authorization: `Bearer ${SECRET}` }, 'my151-prod.vercel.app')).status).toBe(200);
    expect(hash('clients').has('old-browser-0001')).toBe(false);
  });
});

describe('dashboard after retention', () => {
  it('keeps a retired browser in the all-time browser count and its breakdowns, and only there', async () => {
    hash('clients').set('old-browser-0001', dexRecord('old-browser-0001', THIRTEEN_MONTHS_AND_A_DAY, { country: 'FR', device: 'Desktop' }));
    hash('clients').set('new-browser-0001', dexRecord('new-browser-0001', NOW - DAY));
    const source = async () => ({
      clients: Object.fromEntries(hash('clients')), archived: [], funnel: null, funnelWindow: null,
      leagueClients: {}, favoriteClients: {}, retired: (await readRetention()).retired,
    });
    const before = buildDashboard(await source(), { range: 'all' }, NOW).byTool;

    await call();

    const after = buildDashboard(await source(), { range: 'all' }, NOW).byTool;
    expect(hash('clients').size).toBe(1);
    expect(after.dex.users).toBe(2);
    expect(after.all.users).toBe(before.all.users);
    expect(after.dex.countries).toEqual(before.dex.countries);
    expect(after.dex.devices).toEqual(before.dex.devices);
    expect(buildDashboard(await source(), { range: '7d' }, NOW).byTool.dex.users).toBe(1);
    expect((await readRetention()).cleanup).toEqual({ lastRunAt: new Date(NOW).toISOString(), browsers: { dex: 1, league: 0, favorites: 0, all: 1 } });
  });
});
