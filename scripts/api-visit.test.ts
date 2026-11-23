import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '../api/_vercel';

const store = new Map<string, Map<string, number>>();
const expiries = new Map<string, number>();
const limits = new Map<string, number>();

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor() {
      return {
        eval: async (script: string, keys: string[], args: (string | number)[]) => {
          if (!script.includes("'HINCRBY'")) throw new Error('unexpected script');
          const hash = store.get(keys[0]) ?? new Map<string, number>();
          store.set(keys[0], hash);
          for (const field of args) hash.set(String(field), (hash.get(String(field)) ?? 0) + 1);
          if (/EXPIRE/i.test(script)) expiries.set(keys[0], 1);
          return args.length;
        },
      };
    }
  },
}));
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    prefix: string;
    max: number;
    static fixedWindow(max: number) {
      return { max };
    }
    constructor(options: { prefix: string; limiter: { max: number } }) {
      this.prefix = options.prefix;
      this.max = options.limiter.max;
    }
    async limit(key: string) {
      const id = `${this.prefix}:${key}`;
      const used = (limits.get(id) ?? 0) + 1;
      limits.set(id, used);
      return { success: used <= this.max, reset: Date.now() + 600_000 };
    }
  },
}));

const { default: visit } = await import('../api/visit');

async function call(body: unknown, headers: Record<string, string> = {}) {
  let status = 0;
  const res = {
    status: (code: number) => {
      status = code;
      return { json: () => undefined };
    },
    setHeader: () => res,
  } as unknown as VercelResponse;
  await visit({ method: 'POST', body, headers: { 'x-real-ip': '203.0.113.9', 'x-vercel-ip-country': 'DE', ...headers }, query: {}, socket: {} } as unknown as VercelRequest, res);
  return status;
}

const CID = '00000000-0000-4000-8000-000000000042';
const today = () => `visits:${new Date().toISOString().slice(0, 10)}`;
const stored = () => Object.fromEntries([...store].map(([key, hash]) => [key, Object.fromEntries(hash)]));

beforeEach(() => {
  store.clear();
  expiries.clear();
  limits.clear();
});

describe('anonymous visit totals', () => {
  it('counts an opted-out visit in the daily totals and its opted-out share, and stores nothing else', async () => {
    expect(await call({ tool: 'dex', page: '/pokedex-builder', out: true, cid: CID, country: 'DE' })).toBe(200);

    expect(stored()).toEqual({
      [today()]: {
        all: 1,
        'all:optout': 1,
        'tool:dex': 1,
        'tool:dex:optout': 1,
        'page:/pokedex-builder': 1,
        'page:/pokedex-builder:optout': 1,
      },
    });
    expect(expiries.has(today())).toBe(false);
    expect(JSON.stringify(stored())).not.toMatch(/0042|DE|203\.0\.113/);
  });

  it('counts a counted visit only in the totals, so the share is opted-out over all', async () => {
    await call({ tool: 'hub', page: '/' });
    await call({ tool: 'hub', page: '/', out: true });
    expect(stored()[today()]).toEqual({ all: 2, 'all:optout': 1, 'tool:hub': 2, 'tool:hub:optout': 1, 'page:/': 2, 'page:/:optout': 1 });
  });

  it('files an unknown page under other, so no visitor text becomes a field name', async () => {
    await call({ tool: 'league', page: '/custom-gym-leader?name=Brock' });
    expect(Object.keys(stored()[today()])).toEqual(['all', 'tool:league', 'page:other']);
  });

  it('stores nothing for automation, a preview, or a bad tool', async () => {
    await call({ tool: 'hub', page: '/', auto: true });
    expect(await call({ tool: 'admin', page: '/' })).toBe(400);
    process.env.VERCEL_ENV = 'preview';
    await call({ tool: 'hub', page: '/' }, { host: 'my151-git-branch.vercel.app' });
    delete process.env.VERCEL_ENV;
    expect(stored()).toEqual({});
  });

  it('stops one address after 300 visits in ten minutes', async () => {
    const statuses = [];
    for (let i = 0; i < 301; i++) statuses.push(await call({ tool: 'hub', page: '/' }));
    expect(statuses.filter((s) => s === 429)).toHaveLength(1);
    expect(stored()[today()].all).toBe(300);
  });
});
