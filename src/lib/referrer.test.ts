import { describe, expect, it } from 'vitest';
import { externalReferrerHost } from './referrer';

const OWN = 'https://my151.app';

describe('externalReferrerHost', () => {
  it('returns the host of an external referrer', () => {
    expect(externalReferrerHost('https://www.reddit.com/r/pokemon/', OWN)).toBe('www.reddit.com');
    expect(externalReferrerHost('https://t.co/abc123', OWN)).toBe('t.co');
  });

  it('returns empty for a same-origin (internal) referrer', () => {
    expect(externalReferrerHost('https://my151.app/pokedex-builder', OWN)).toBe('');
  });
});
