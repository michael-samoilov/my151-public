import { describe, expect, it } from 'vitest';
import { externalReferrerHost } from './referrer';

const OWN = 'https://my151.app';

describe('externalReferrerHost', () => {
  it('returns the host of an external referrer', () => {
    expect(externalReferrerHost('https://www.reddit.com/r/pokemon/', OWN)).toBe('www.reddit.com');
    expect(externalReferrerHost('https://t.co/abc123', OWN)).toBe('t.co');
  });

  it('drops the path and query — host only', () => {
    expect(externalReferrerHost('https://www.google.com/search?q=a+secret+thing', OWN)).toBe(
      'www.google.com',
    );
  });

  it('returns empty for a same-origin (internal) referrer', () => {
    expect(externalReferrerHost('https://my151.app/pokedex-builder', OWN)).toBe('');
  });

  it('returns empty for a direct visit (no referrer)', () => {
    expect(externalReferrerHost('', OWN)).toBe('');
  });

  it('returns empty for a malformed referrer', () => {
    expect(externalReferrerHost('not a url', OWN)).toBe('');
  });

  it('lowercases the host', () => {
    expect(externalReferrerHost('https://News.YCombinator.com/item?id=1', OWN)).toBe(
      'news.ycombinator.com',
    );
  });
});
