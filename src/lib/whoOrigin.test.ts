import { describe, expect, it } from 'vitest';
import { negotiateLocale } from '@/i18n/detect';
import {
  FLAG_W,
  OTHER_KEY,
  countryItems,
  distinctCountries,
  fitBar,
  formatShare,
  languageOverrides,
  regionBar,
  unshippedTags,
  type FitItem,
} from '@/lib/whoOrigin';

const EUROPE: FitItem[] = [
  ['GB', 65],
  ['IT', 26],
  ['FR', 13],
  ['NL', 13],
  ['DE', 11],
  ['ES', 10],
  ['CH', 5],
  ['IE', 5],
  ['SE', 5],
  ['DK', 3],
  ['CZ', 2],
  ['HR', 2],
  ['NO', 2],
  ['GR', 1],
  ['PL', 1],
].map(([key, n]) => ({ key: String(key), n: Number(n) }));

describe('fitBar', () => {
  it('keeps Europe through Spain at the phone sketch width', () => {
    const segs = fitBar(EUROPE, 342, () => FLAG_W);
    expect(segs.map((s) => s.key)).toEqual(['GB', 'IT', 'FR', 'NL', 'DE', 'ES', OTHER_KEY]);
    expect(segs.at(-1)?.folded?.map((f) => f.key)).toEqual(['CH', 'IE', 'SE', 'DK', 'CZ', 'HR', 'NO', 'GR', 'PL']);
    expect(segs[0].widthPx).toBeCloseTo((65 / 164) * 342, 5);
  });

  it('also keeps Switzerland through Denmark at the desktop content width', () => {
    const segs = fitBar(EUROPE, 992, () => FLAG_W);
    expect(segs.map((s) => s.key)).toEqual(['GB', 'IT', 'FR', 'NL', 'DE', 'ES', 'CH', 'IE', 'SE', 'DK', OTHER_KEY]);
    expect(segs.at(-1)?.folded?.map((f) => f.key)[0]).toBe('CZ');
  });

  it('folds a code when the previous code does not clear 4px', () => {
    const items = [
      { key: 'pt-BR', n: 10 },
      { key: 'nl', n: 4 },
      { key: 'sv', n: 1 },
    ];
    const width = (key: string) => (key === 'pt-BR' ? 40 : 30);
    const segs = fitBar(items, 100, width);
    expect(segs.map((s) => s.key)).toEqual(['pt-BR', 'nl', OTHER_KEY]);
    expect(segs.at(-1)?.n).toBe(1);
  });
});

describe('formatShare', () => {
  it('keeps one decimal under 10% and the sign only when asked', () => {
    expect(formatShare(5, 164, true)).toBe('3.0%');
    expect(formatShare(5, 164, false)).toBe('3.0');
    expect(formatShare(20, 100, true)).toBe('20%');
  });
});

describe('language modules', () => {
  const buckets = [
    { country: 'FR', lang: 'fr', locale: 'fr', switched: 'en', n: 1 },
    { country: 'US', lang: 'en-US', locale: 'en', switched: 'en', n: 1 },
    { country: 'US', lang: 'pt-BR', locale: 'en', switched: '', n: 4 },
    { country: 'GB', lang: 'nl', locale: 'en', switched: '', n: 2 },
    { country: 'DE', lang: 'de', locale: 'de', switched: '', n: 3 },
  ];

  it('drops a pin that matches negotiation', () => {
    expect(negotiateLocale(['en-US'])).toBe('en');
    expect(negotiateLocale(['fr'])).toBe('fr');
    expect(languageOverrides(buckets, 'Europe')).toEqual([
      { lang: 'fr', switched: 'en', country: 'FR', n: 1 },
    ]);
    expect(languageOverrides(buckets, 'North America')).toEqual([]);
  });

  it('counts only unshipped tags in the selected region', () => {
    expect(unshippedTags(buckets, 'North America').map((t) => t.key)).toEqual(['pt-BR']);
    expect(unshippedTags(buckets, 'Europe').map((t) => t.key)).toEqual(['nl']);
  });

  it('builds country children from the same country tally', () => {
    const countries = { US: 10, CA: 2, FR: 3, GB: 1 };
    expect(countryItems(countries, 'North America').map((c) => c.key).sort()).toEqual(['CA', 'US']);
    expect(regionBar(countries, 100).map((r) => r.label)).toEqual(['North America', 'Europe']);
    expect(distinctCountries(countries)).toBe(4);
  });
});
