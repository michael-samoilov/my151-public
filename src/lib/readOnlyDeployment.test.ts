// keeps: real users' writes dropped when my151.app points at a preview deployment (PR #81), and preview visits writing production analytics.
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

  it('reads x-forwarded-host before host, so an alias is judged by the domain the visitor used', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(isReadOnlyDeployment(req({ 'x-forwarded-host': 'my151.app', host: PREVIEW_HOST }))).toBe(false);
    expect(isReadOnlyDeployment(req({ 'x-forwarded-host': PREVIEW_HOST, host: 'my151.app' }))).toBe(true);
  });

  it('never blocks production or local builds, whatever the host', () => {
    for (const env of ['production', 'development', '']) {
      vi.stubEnv('VERCEL_ENV', env);
      expect(isReadOnlyDeployment(req({ host: PREVIEW_HOST }))).toBe(false);
    }
  });
});
