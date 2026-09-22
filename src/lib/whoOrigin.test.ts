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
  mixWho,
  regionBar,
  unshippedTags,
  visibleBuckets,
  type FitItem,
  type WhoBucket,
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

  it('keeps a flag that hangs past its segment when it clears the previous flag', () => {
    const items = [
      { key: 'GB', n: 60 },
      { key: 'ES', n: 22 },
      { key: 'NL', n: 10 },
      { key: 'CH', n: 8 },
    ];
    const segs = fitBar(items, 100, () => FLAG_W);
    expect(segs.map((s) => s.key)).toEqual(['GB', 'ES', 'NL', OTHER_KEY]);
    const nl = segs.find((s) => s.key === 'NL');
    expect(nl && nl.widthPx).toBeLessThan(FLAG_W);
    const es = segs.find((s) => s.key === 'ES');
    expect(es && nl && nl.leftPx - (es.leftPx + FLAG_W)).toBeCloseTo(4, 5);
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
  const buckets: WhoBucket[] = [
    { country: 'FR', lang: 'fr', locale: 'fr', switched: 'en', device: 'Mobile', os: 'iOS', browser: 'Safari', n: 1 },
    { country: 'US', lang: 'en-US', locale: 'en', switched: 'en', device: 'Desktop', os: 'macOS', browser: 'Chrome', n: 1 },
    { country: 'US', lang: 'pt-BR', locale: 'en', switched: '', device: 'Mobile', os: 'iOS', browser: 'Safari', n: 4 },
    { country: 'GB', lang: 'nl', locale: 'en', switched: '', device: 'Desktop', os: 'Windows', browser: 'Chrome', n: 2 },
    { country: 'DE', lang: 'de', locale: 'de', switched: '', device: 'Desktop', os: 'Windows', browser: 'Chrome', n: 3 },
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

  it('redraws other charts inside the pressed segment', () => {
    expect(mixWho(buckets, 'region', { dim: 'device', value: 'Mobile' })).toEqual({
      'North America': 4,
      Europe: 1,
    });
    expect(mixWho(buckets, 'device', { dim: 'region', value: 'Europe' })).toEqual({
      Mobile: 1,
      Desktop: 5,
    });
    expect(mixWho(buckets, 'device', { dim: 'device', value: 'Mobile' })).toEqual({
      Mobile: 5,
      Desktop: 6,
    });
    const mobile = visibleBuckets(buckets, { dim: 'device', value: 'Mobile' }, 'North America');
    expect(mobile.map((b) => b.country).sort()).toEqual(['FR', 'US']);
    const europe = visibleBuckets(buckets, { dim: 'region', value: 'Europe' }, 'North America');
    expect(europe.map((b) => b.country).sort()).toEqual(['DE', 'FR', 'GB']);
  });

  it('builds country children from the same country tally', () => {
    const countries = { US: 10, CA: 2, FR: 3, GB: 1 };
    expect(countryItems(countries, 'North America').map((c) => c.key).sort()).toEqual(['CA', 'US']);
    expect(regionBar(countries, 100).map((r) => r.label)).toEqual(['North America', 'Europe']);
    expect(distinctCountries(countries)).toBe(4);
  });
});
