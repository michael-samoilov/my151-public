import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { VercelRequest } from '@vercel/node';

let isReadOnlyDeployment: (req: VercelRequest) => boolean;

beforeAll(async () => {
  process.env.UPSTASH_REDIS_REST_URL ||= 'https://example.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN ||= 'test-token';
  ({ isReadOnlyDeployment } = await import('../../api/_shared'));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const req = (headers: Record<string, string>) => ({ headers }) as unknown as VercelRequest;
const PREVIEW_HOST = 'preview-host.vercel.app';

describe('isReadOnlyDeployment', () => {
  it('blocks a preview URL, so agent and test visits store nothing', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(isReadOnlyDeployment(req({ host: PREVIEW_HOST }))).toBe(true);
  });

  it('never blocks the live hosts on a preview deployment, so real users keep their data', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    for (const host of ['my151.app', 'www.my151.app', 'My151.App:443']) {
      expect(isReadOnlyDeployment(req({ host }))).toBe(false);
    }
  });

  it('judges by the host Vercel routes on, so a caller-sent x-forwarded-host cannot unlock writes', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(isReadOnlyDeployment(req({ 'x-forwarded-host': 'my151.app', host: PREVIEW_HOST }))).toBe(true);
    expect(isReadOnlyDeployment(req({ 'x-forwarded-host': PREVIEW_HOST, host: 'my151.app' }))).toBe(false);
  });

  it('blocks a production deployment reached by its own vercel.app URL, and never the live hosts', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(isReadOnlyDeployment(req({ host: 'preview-host.vercel.app' }))).toBe(true);
    expect(isReadOnlyDeployment(req({}))).toBe(true);
    for (const host of ['my151.app', 'www.my151.app']) expect(isReadOnlyDeployment(req({ host }))).toBe(false);
  });

  it('never blocks local builds, whatever the host', () => {
    for (const env of ['development', '']) {
      vi.stubEnv('VERCEL_ENV', env);
      expect(isReadOnlyDeployment(req({ host: PREVIEW_HOST }))).toBe(false);
    }
  });
});
