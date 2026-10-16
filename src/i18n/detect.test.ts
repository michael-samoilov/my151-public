import { describe, expect, it } from 'vitest';
import { matchLocale, negotiateLocale } from './detect';

describe('matchLocale', () => {
  it('maps Chinese regions onto the right script', () => {
    expect(matchLocale('zh-TW')).toBe('zh-Hant');
    expect(matchLocale('zh-HK')).toBe('zh-Hant');
    expect(matchLocale('zh-MO')).toBe('zh-Hant');
    expect(matchLocale('zh-Hant-TW')).toBe('zh-Hant');
    expect(matchLocale('zh-CN')).toBe('zh-Hans');
    expect(matchLocale('zh-SG')).toBe('zh-Hans');
    expect(matchLocale('zh-Hans-CN')).toBe('zh-Hans');
    expect(matchLocale('zh')).toBe('zh-Hans');
  });
});

describe('negotiateLocale', () => {
  it('honours the browser order, not our declaration order', () => {
    expect(negotiateLocale(['ko', 'ja'])).toBe('ko');
    expect(negotiateLocale(['ja', 'ko'])).toBe('ja');
  });

  it('skips unsupported entries', () => {
    expect(negotiateLocale(['pt-BR', 'nl', 'it'])).toBe('it');
  });
});
