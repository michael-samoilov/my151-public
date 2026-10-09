import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/_shared', () => ({ redis: {}, requireAdmin: vi.fn(), firstQueryValue: (v: unknown) => String(v ?? ''), CLIENTS_KEY: 'clients' }));
const { upstashUsage } = await import('../../../api/submissions');

const ENV = { UPSTASH_MGMT_EMAIL: 'me@example.com', UPSTASH_MGMT_API_KEY: 'k', UPSTASH_DB_ID: 'db-1' } as NodeJS.ProcessEnv;

describe('upstashUsage', () => {
  it('reports not_configured without all three variables, and calls nothing', async () => {
    const get = vi.fn();
    expect(await upstashUsage({ UPSTASH_MGMT_EMAIL: 'me@example.com' } as NodeJS.ProcessEnv, get)).toEqual({ status: 'not_configured' });
    expect(get).not.toHaveBeenCalled();
  });

  it('asks Get Database Stats with Basic auth and strips credential-like fields', async () => {
    const get = vi.fn(async () => new Response(JSON.stringify({ daily_net_commands: 7, endpoint: 'x.upstash.io', nested: { password: 'p', y: 1 } })));
    const out = await upstashUsage(ENV, get as unknown as typeof fetch);
    const [url, init] = get.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.upstash.com/v2/redis/stats/db-1');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('me@example.com:k').toString('base64')}`);
    expect(out).toEqual({ status: 'ready', stats: { daily_net_commands: 7, nested: { y: 1 } } });
  });

  it('reports the HTTP status when Upstash refuses', async () => {
    const get = vi.fn(async () => new Response('no', { status: 401 }));
    expect(await upstashUsage(ENV, get as unknown as typeof fetch)).toEqual({ status: 'error', http: 401 });
  });
});
