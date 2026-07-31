import { afterEach, describe, expect, it } from 'vitest';
import { en, enUi } from './catalogs/en';
import { enData } from './catalogs/en.data';
import {
  formatList,
  formatNumber,
  interpolate,
  localeUppercase,
  setCatalog,
  translate,
  translatePlural,
} from './core';
import type { Messages } from './types';

afterEach(() => setCatalog('en', en));

describe('interpolate', () => {
  it('substitutes named placeholders', () => {
    expect(interpolate('Reach {count} Pokémon', { count: 25 })).toBe('Reach 25 Pokémon');
  });

  it('substitutes a placeholder used more than once', () => {
    expect(interpolate('{a} then {a}', { a: 'x' })).toBe('x then x');
  });

  it('ignores extra arguments', () => {
    expect(interpolate('Hi {name}', { name: 'Ash', unused: 1 })).toBe('Hi Ash');
  });

  it('leaves an unmatched placeholder verbatim rather than blanking it', () => {
    // A visible {count} is a bug report; a silent gap is a mystery.
    expect(interpolate('Reach {count}', {})).toBe('Reach {count}');
  });

  it('leaves text alone when there are no arguments', () => {
    expect(interpolate('Reach {count}')).toBe('Reach {count}');
  });
});

describe('translate', () => {
  it('reads the active catalog', () => {
    setCatalog('de', { ...en, 'nav.build': 'Bauen' } as Messages);
    expect(translate('nav.build')).toBe('Bauen');
  });

  it('falls back to English for a key the active catalog is missing', () => {
    // Reachable only while a lazily-loaded catalog is still in flight.
    const partial = { ...en } as Record<string, string>;
    delete partial['nav.build'];
    setCatalog('de', partial as unknown as Messages);
    expect(translate('nav.build')).toBe('Build');
  });
});

describe('translatePlural', () => {
  const counted = {
    ...en,
    'test.count_one': '{count} line',
    'test.count_other': '{count} lines',
  } as unknown as Messages;

  it('selects English singular and plural', () => {
    setCatalog('en', counted);
    expect(translatePlural('test.count' as never, 1)).toBe('1 line');
    expect(translatePlural('test.count' as never, 0)).toBe('0 lines');
    expect(translatePlural('test.count' as never, 2)).toBe('2 lines');
  });

  it('resolves for a locale with only _other, which ja/ko/zh supply', () => {
    setCatalog('ja', { ...en, 'test.count_other': '{count}ライン' } as unknown as Messages);
    expect(translatePlural('test.count' as never, 1)).toBe('1ライン');
    expect(translatePlural('test.count' as never, 7)).toBe('7ライン');
  });

  it('uses the _many category where a locale defines one', () => {
    // fr puts large round numbers in `many`; en has no such category.
    setCatalog('fr', {
      ...en,
      'test.count_one': '{count} ligne',
      'test.count_many': '{count} de lignes',
      'test.count_other': '{count} lignes',
    } as unknown as Messages);
    expect(translatePlural('test.count' as never, 1)).toBe('1 ligne');
    expect(translatePlural('test.count' as never, 3)).toBe('3 lignes');
    expect(translatePlural('test.count' as never, 1_000_000)).toBe('1000000 de lignes');
  });

  it('passes count through without the caller repeating it', () => {
    setCatalog('en', counted);
    expect(translatePlural('test.count' as never, 4)).toBe('4 lines');
  });
});

describe('locale-bound formatting', () => {
  it('formats numbers with the locale separator', () => {
    setCatalog('en', en);
    expect(formatNumber(1234.5)).toBe('1,234.5');
    setCatalog('de', en);
    expect(formatNumber(1234.5)).toBe('1.234,5');
  });

  it('joins lists the way the locale does, not with a hardcoded comma', () => {
    setCatalog('en', en);
    expect(formatList(['Fire', 'Water', 'Grass'])).toBe('Fire, Water, and Grass');
    // ja uses the ideographic comma and no conjunction — `', '.join()` would be
    // wrong in a way that reads as broken rather than merely foreign.
    setCatalog('ja', en);
    expect(formatList(['ほのお', 'みず', 'くさ'])).toBe('ほのお、みず、くさ');
    setCatalog('de', en);
    expect(formatList(['Feuer', 'Wasser'])).toBe('Feuer und Wasser');
  });
});

describe('localeUppercase', () => {
  it('uppercases Latin scripts', () => {
    setCatalog('en', en);
    expect(localeUppercase('Fighting')).toBe('FIGHTING');
  });

  it('is a no-op for CJK, where it only mangles embedded Latin', () => {
    for (const locale of ['ja', 'ko', 'zh-Hans', 'zh-Hant'] as const) {
      setCatalog(locale, en);
      expect(localeUppercase('かくとう')).toBe('かくとう');
      expect(localeUppercase('Gen 3')).toBe('Gen 3');
    }
  });
});

describe('the catalog itself', () => {
  it('keeps its two sources sorted and disjoint', () => {
    // `en` is enUi spread over enData, so a key defined in both would be
    // silently overwritten with no error anywhere. Each source is sorted so a
    // merge conflict can't quietly duplicate a key within one file either.
    const ui = Object.keys(enUi);
    const data = Object.keys(enData);
    expect(ui).toEqual([...ui].sort());
    expect(data).toEqual([...data].sort());
    expect(ui.filter((k) => data.includes(k)), 'defined in both catalogs').toEqual([]);
    expect(Object.keys(en)).toHaveLength(ui.length + data.length);
  });

  it('defines _other for every counted message', () => {
    const bases = new Set(
      Object.keys(en)
        .filter((k) => /_(zero|one|two|few|many|other)$/.test(k))
        .map((k) => k.replace(/_(zero|one|two|few|many|other)$/, '')),
    );
    for (const base of bases) {
      expect(Object.keys(en)).toContain(`${base}_other`);
    }
  });
});
