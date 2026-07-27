import { describe, expect, it } from 'vitest';
import { matchLocale, negotiateLocale, localeFromUrl, resolveLocale } from './detect';

describe('matchLocale', () => {
  it('matches an exact tag', () => {
    expect(matchLocale('ja')).toBe('ja');
    expect(matchLocale('DE')).toBe('de');
  });

  it('falls back to the primary subtag', () => {
    expect(matchLocale('fr-CA')).toBe('fr');
    expect(matchLocale('es-419')).toBe('es');
    expect(matchLocale('en-GB')).toBe('en');
  });

  it('maps Chinese regions onto the right script', () => {
    // Browsers report regions; the app ships scripts. Getting this wrong sends
    // every Traditional reader to the Simplified catalog.
    expect(matchLocale('zh-TW')).toBe('zh-Hant');
    expect(matchLocale('zh-HK')).toBe('zh-Hant');
    expect(matchLocale('zh-MO')).toBe('zh-Hant');
    expect(matchLocale('zh-Hant-TW')).toBe('zh-Hant');
    expect(matchLocale('zh-CN')).toBe('zh-Hans');
    expect(matchLocale('zh-SG')).toBe('zh-Hans');
    expect(matchLocale('zh-Hans-CN')).toBe('zh-Hans');
    expect(matchLocale('zh')).toBe('zh-Hans');
  });

  it('returns null for an unsupported language', () => {
    expect(matchLocale('pt-BR')).toBeNull();
    expect(matchLocale('nl')).toBeNull();
    expect(matchLocale('')).toBeNull();
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

  it('falls back to English', () => {
    expect(negotiateLocale(['pt-BR', 'nl'])).toBe('en');
    expect(negotiateLocale([])).toBe('en');
  });
});

describe('localeFromUrl', () => {
  it('reads a supported ?lang=', () => {
    expect(localeFromUrl('?lang=ja')).toBe('ja');
    expect(localeFromUrl('?admin&lang=zh-Hant')).toBe('zh-Hant');
  });

  it('ignores an unsupported or absent value', () => {
    expect(localeFromUrl('?lang=xx')).toBeNull();
    expect(localeFromUrl('?lang=')).toBeNull();
    expect(localeFromUrl('?tune')).toBeNull();
    expect(localeFromUrl('')).toBeNull();
  });
});

describe('resolveLocale', () => {
  it('lets ?lang= win over a stored choice', () => {
    expect(resolveLocale({ url: '?lang=de', stored: 'ja', navigatorLanguages: ['fr'] })).toBe('de');
  });

  it('lets a stored choice win over the browser', () => {
    expect(resolveLocale({ stored: 'ja', navigatorLanguages: ['fr'] })).toBe('ja');
  });

  it('follows the browser when nothing is stored', () => {
    // null means "never opened the picker", so the user keeps tracking their
    // browser rather than being pinned to whatever it was on first visit.
    expect(resolveLocale({ stored: null, navigatorLanguages: ['it', 'en'] })).toBe('it');
  });

  it('falls back to English with no signal at all', () => {
    expect(resolveLocale({})).toBe('en');
  });
});
