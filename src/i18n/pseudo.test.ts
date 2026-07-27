import { describe, expect, it } from 'vitest';
import { en } from './catalogs/en';
import { accentuate, buildPseudoCatalog, isPseudoLocale, widen } from './pseudo';

describe('accentuate (en-XA)', () => {
  it('accents every ASCII letter so unextracted strings stand out', () => {
    // The point of the accents: anything still rendering in plain ASCII on
    // screen is a string that was never routed through t().
    expect(accentuate('Build')).toMatch(/^\[Ɓúíłđ/);
    expect(accentuate('Build')).not.toContain('Build');
  });

  it('brackets the string so clipping is distinguishable from overflow', () => {
    const out = accentuate('View');
    expect(out.startsWith('[')).toBe(true);
    expect(out.endsWith(']')).toBe(true);
  });

  it('expands the text to approximate German', () => {
    const source = 'Generation Origin';
    const out = accentuate(source);
    const inner = out.slice(1, -1);
    expect(inner.length).toBeGreaterThan(source.length * 1.3);
  });

  it('leaves placeholders untouched', () => {
    // Mangling {count} would make the pseudo-locale fail for a reason that has
    // nothing to do with layout.
    const out = accentuate('Reach {count} Pokémon to unlock');
    expect(out).toContain('{count}');
  });

  it('does not count placeholder length towards the padding', () => {
    const short = accentuate('Hi {a}');
    const long = accentuate('Hi {averyverylongplaceholdername}');
    const padOf = (s: string) => (s.match(/·/g) ?? []).length;
    expect(padOf(short)).toBe(padOf(long));
  });

  it('preserves non-ASCII characters it has no accent for', () => {
    expect(accentuate('Pokémon')).toContain('é');
  });
});

describe('widen (en-XC)', () => {
  it('replaces Latin with full-width glyphs', () => {
    const out = widen('Analytics');
    expect(out).not.toMatch(/[A-Za-z]/);
    expect(out).toMatch(/[一-鿿]/);
  });

  it('leaves placeholders untouched', () => {
    expect(widen('Reach {count} Pokémon')).toContain('{count}');
  });

  it('uses roughly half as many glyphs, since each is double-width', () => {
    const source = 'Generation Origin';
    const out = widen(source);
    expect(out.length).toBeLessThan(source.length);
    expect(out.length).toBeGreaterThan(source.length * 0.3);
  });
});

describe('buildPseudoCatalog', () => {
  it('covers every key in the English catalog', () => {
    // Generated from `en` at runtime, so it can't drift the way a checked-in
    // fixture would.
    for (const which of ['en-XA', 'en-XC'] as const) {
      expect(Object.keys(buildPseudoCatalog(which))).toEqual(Object.keys(en));
    }
  });
});

describe('isPseudoLocale', () => {
  it('recognises only the two pseudo-locales', () => {
    expect(isPseudoLocale('en-XA')).toBe(true);
    expect(isPseudoLocale('en-XC')).toBe(true);
    expect(isPseudoLocale('en')).toBe(false);
    expect(isPseudoLocale('ja')).toBe(false);
    expect(isPseudoLocale(null)).toBe(false);
  });
});
