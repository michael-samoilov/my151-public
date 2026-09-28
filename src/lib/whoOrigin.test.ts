import { describe, expect, it } from 'vitest';
import { negotiateLocale } from '@/i18n/detect';
import {
  FLAG_W,
  OTHER_KEY,
  balanceRailRows,
  countryCounts,
  countryHeaderCount,
  countryItems,
  distinctCountries,
  fitBar,
  formatShare,
  languageOverrides,
  languageShare,
  layoutNameLabels,
  spelledLanguage,
  primaryLanguageRegion,
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
  it('keeps a flag whose gap is under 4px when the flags do not overlap', () => {
    const segs = fitBar(EUROPE, 342, () => FLAG_W);
    expect(segs.map((s) => s.key)).toEqual(['GB', 'IT', 'FR', 'NL', 'DE', 'ES', 'CH', OTHER_KEY]);
    const es = segs.find((s) => s.key === 'ES');
    const ch = segs.find((s) => s.key === 'CH');
    const gap = es && ch ? ch.leftPx - (es.leftPx + FLAG_W) : -1;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(4);
    expect(segs.at(-1)?.folded?.map((f) => f.key)[0]).toBe('IE');
  });

  it('left-aligns a region name and shifts the next name when they would overlap', () => {
    const clear = layoutNameLabels(
      [
        { key: 'NA', leftPx: 0, widthPx: 80 },
        { key: 'EU', leftPx: 80, widthPx: 40 },
      ],
      [30, 20],
      200,
    );
    expect(clear.map((l) => l.leftPx)).toEqual([0, 80]);
    const hung = layoutNameLabels(
      [
        { key: 'LATAM', leftPx: 100, widthPx: 20 },
        { key: 'MEA', leftPx: 120, widthPx: 16 },
      ],
      [48, 36],
      200,
    );
    expect(hung[0].leftPx).toBe(100);
    expect(hung[1].leftPx).toBe(152);
  });

  it('makes the top rail row the longest', () => {
    expect(balanceRailRows([10, 10], 4, 100)).toEqual([[0, 1]]);
    expect(balanceRailRows([10, 10, 10, 10, 10], 0, 40)).toEqual([
      [0, 1, 2],
      [3, 4],
    ]);
    expect(balanceRailRows([10, 10, 10, 10, 10, 10], 0, 40)).toEqual([
      [0, 1, 2, 3],
      [4, 5],
    ]);
  });

  it('wraps the top rail row inside the container', () => {
    expect(balanceRailRows([10, 10, 10, 10, 10, 10], 0, 25)).toEqual([
      [0, 1],
      [2],
      [3],
      [4],
      [5],
    ]);
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
    { country: 'FR', lang: 'fr', locale: 'fr', switched: 'en', device: 'Mobile', os: 'iOS', browser: 'Safari', n: 1, n7d: 1 },
    { country: 'US', lang: 'en-US', locale: 'en', switched: 'en', device: 'Desktop', os: 'macOS', browser: 'Chrome', n: 1, n7d: 0 },
    { country: 'US', lang: 'pt-BR', locale: 'en', switched: '', device: 'Mobile', os: 'iOS', browser: 'Safari', n: 4, n7d: 4 },
    { country: 'GB', lang: 'nl', locale: 'en', switched: '', device: 'Desktop', os: 'Windows', browser: 'Chrome', n: 2, n7d: 0 },
    { country: 'DE', lang: 'de', locale: 'de', switched: '', device: 'Desktop', os: 'Windows', browser: 'Chrome', n: 3, n7d: 3 },
  ];

  it('drops a pin that matches negotiation', () => {
    expect(negotiateLocale(['en-US'])).toBe('en');
    expect(negotiateLocale(['fr'])).toBe('fr');
    expect(languageOverrides(buckets, 'Europe')).toEqual([
      { lang: 'fr', switched: 'en', country: 'FR', n: 1 },
    ]);
    expect(languageOverrides(buckets, 'North America')).toEqual([]);
  });

  it('counts countries in the pressed slice', () => {
    expect(countryHeaderCount(buckets, { dim: 'device', value: 'Mobile' }, 'North America')).toBe(2);
    expect(countryHeaderCount(buckets, { dim: 'region', value: 'Europe' }, 'North America')).toBe(3);
  });

  it('colors a language by the region with the most users', () => {
    expect(primaryLanguageRegion(buckets, 'pt-BR')).toBe('North America');
    expect(primaryLanguageRegion(buckets, 'nl')).toBe('Europe');
  });

  it('merges tags that spell one language and counts each user once', () => {
    expect(spelledLanguage('he')).toBe(spelledLanguage('he-IL'));
    expect(spelledLanguage('iw')).toBe('Hebrew');
    expect(spelledLanguage('tl')).toBe(spelledLanguage('fil'));
    const hebrew: WhoBucket[] = [
      { country: 'IL', lang: 'he', locale: 'en', switched: '', device: 'Mobile', os: 'iOS', browser: 'Safari', n: 2, n7d: 2 },
      { country: 'IL', lang: 'he-IL', locale: 'en', switched: '', device: 'Mobile', os: 'iOS', browser: 'Safari', n: 3, n7d: 3 },
      { country: 'IL', lang: 'iw', locale: 'en', switched: '', device: 'Desktop', os: 'Windows', browser: 'Chrome', n: 1, n7d: 0 },
      { country: 'PH', lang: 'fil', locale: 'en', switched: '', device: 'Mobile', os: 'Android', browser: 'Chrome', n: 1, n7d: 1 },
      { country: 'PH', lang: 'tl', locale: 'en', switched: '', device: 'Mobile', os: 'Android', browser: 'Chrome', n: 1, n7d: 1 },
      { country: 'IL', lang: 'he', locale: 'en', switched: 'fr', device: 'Mobile', os: 'iOS', browser: 'Safari', n: 4, n7d: 4 },
    ];
    expect(unshippedTags(hebrew, null)).toEqual([
      { key: 'he', n: 6 },
      { key: 'tl', n: 2 },
    ]);
    expect(languageOverrides(hebrew, null)).toEqual([{ lang: 'he', switched: 'fr', country: 'IL', n: 4 }]);
    expect(primaryLanguageRegion(hebrew, 'iw')).toBe('Middle East & Africa');
  });

  it('keeps the language bar a share of everyone', () => {
    const share = languageShare(buckets, null);
    expect(share.map((item) => item.key)).toEqual(['served', 'unshipped', 'overrides']);
    expect(share.map((item) => item.n)).toEqual([4, 6, 1]);
    expect(share.reduce((sum, item) => sum + item.n, 0)).toBe(buckets.reduce((sum, bucket) => sum + bucket.n, 0));
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
    const open = visibleBuckets(buckets, null, null);
    expect([...new Set(open.map((b) => b.country))].sort()).toEqual(['DE', 'FR', 'GB', 'US']);
    expect(countryHeaderCount(buckets, null, null)).toBe(4);
    expect(regionBar(countryCounts(buckets, { dim: 'device', value: 'Mobile' }), 100).map((r) => r.key)).toEqual([
      'North America',
      'Europe',
    ]);
  });

  it('builds country children from the same country tally', () => {
    const countries = { US: 10, CA: 2, FR: 3, GB: 1 };
    expect(countryItems(countries, 'North America').map((c) => c.key).sort()).toEqual(['CA', 'US']);
    expect(countryItems(countries, null).map((c) => c.key).sort()).toEqual(['CA', 'FR', 'GB', 'US']);
    expect(regionBar(countries, 100).map((r) => r.label)).toEqual(['North America', 'Europe']);
    expect(distinctCountries(countries)).toBe(4);
  });
});
