import { beforeAll, describe, expect, it } from 'vitest';

let parseReferrerHost: (v: unknown) => string | undefined;

beforeAll(async () => {
  process.env.UPSTASH_REDIS_REST_URL ||= 'https://example.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN ||= 'test-token';
  ({ parseReferrerHost } = await import('../../api/_shared'));
});

describe('parseReferrerHost', () => {
  it('accepts a bare host', () => {
    expect(parseReferrerHost('reddit.com')).toBe('reddit.com');
    expect(parseReferrerHost('www.google.com')).toBe('www.google.com');
  });

  it('lowercases and trims', () => {
    expect(parseReferrerHost('  T.CO ')).toBe('t.co');
  });

  it('rejects a full URL', () => {
    expect(parseReferrerHost('https://reddit.com/r/x')).toBeUndefined();
  });

  it('rejects a host with no dot', () => {
    expect(parseReferrerHost('localhost')).toBeUndefined();
  });

  it('rejects non-strings, empties and over-long input', () => {
    expect(parseReferrerHost(undefined)).toBeUndefined();
    expect(parseReferrerHost(123)).toBeUndefined();
    expect(parseReferrerHost('a')).toBeUndefined();
    expect(parseReferrerHost('x'.repeat(101) + '.com')).toBeUndefined();
  });
});
