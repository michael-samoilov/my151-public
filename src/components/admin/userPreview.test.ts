import { describe, expect, it } from 'vitest';
import {
  formatWhen,
  fmtChipDuration,
  matchesArchiveFilter,
  matchesToolFilter,
  uniqueFacetValues,
  matchesFacetFilters,
  facetValue,
  facetLabel,
  FACET_UNKNOWN,
  previewLanguage,
  subregionName,
  geoChipLabel,
} from './userPreview';

describe('formatWhen', () => {
  const ts = Date.UTC(2026, 8, 10, 16, 5, 45);

  it('omits seconds and the year', () => {
    const s = formatWhen(ts, 'UTC', 'en-US');
    expect(s).not.toMatch(/\d:\d{2}:\d{2}/);
    expect(s).not.toMatch(/2026/);
    expect(s).toMatch(/4:05\sPM/);
  });

  it('puts the short timezone after AM/PM', () => {
    const utc = formatWhen(ts, 'UTC', 'en-US');
    expect(utc).toMatch(/4:05\sPM\s+(UTC|GMT)/);
    const ny = formatWhen(ts, 'America/New_York', 'en-US');
    expect(ny).toMatch(/12:05\sPM\s+EDT/);
  });
});

describe('fmtChipDuration', () => {
  it('reports 0m under 45 seconds', () => {
    expect(fmtChipDuration(0)).toBe('0m');
    expect(fmtChipDuration(44_000)).toBe('0m');
  });

  it('fits double-digit hours and minutes', () => {
    expect(fmtChipDuration(5999 * 60 * 1000)).toBe('99h 59m');
  });
});

describe('subregionName', () => {
  it('expands a known ISO 3166-2 code to the full term', () => {
    expect(subregionName('AU', 'VIC')).toBe('Victoria');
    expect(subregionName('US', 'NJ')).toBe('New Jersey');
    expect(subregionName('BR', 'SP')).toBe('São Paulo');
  });
});

describe('geoChipLabel', () => {
  it('joins the country with the full subregion term', () => {
    expect(geoChipLabel('AU', 'VIC')).toBe('Australia · Victoria');
    expect(geoChipLabel('US', 'N. America')).toBe('United States · N. America');
  });
});

describe('previewLanguage', () => {
  it('uses the served language when it matches the browser', () => {
    expect(previewLanguage('en-US', 'en', undefined)).toEqual({ kind: 'served', tag: 'en' });
  });

  it('uses the browser language when we could not serve it', () => {
    expect(previewLanguage('el-GR', 'en', undefined)).toEqual({ kind: 'unsupported', tag: 'el-GR' });
  });

  it('uses the switched language when the user picked one', () => {
    expect(previewLanguage('en-US', 'en', 'ja')).toEqual({ kind: 'switched', tag: 'ja' });
  });
});

describe('preview filters', () => {
  it('hides archived rows on the active filter', () => {
    expect(matchesArchiveFilter(false, 'active')).toBe(true);
    expect(matchesArchiveFilter(true, 'active')).toBe(false);
    expect(matchesArchiveFilter(true, 'archived')).toBe(true);
    expect(matchesArchiveFilter(false, 'all')).toBe(true);
  });

  it('matches a tool filter against presence', () => {
    expect(matchesToolFilter({dex: {}, league: {}}, 'any')).toBe(true);
    expect(matchesToolFilter({dex: {}}, 'dex')).toBe(true);
    expect(matchesToolFilter({dex: {}}, 'league')).toBe(false);
    expect(matchesToolFilter({dex: {}, league: {}, picker: {}}, 'picker')).toBe(true);
  });

  it('matches a facet against the displayed platform fields', () => {
    const rec = {
      country: 'US',
      device: 'Desktop',
      os: 'Windows',
      browser: 'Chrome',
      lang: 'en-US',
      locale: 'en',
    };
    expect(facetValue(rec, 'country')).toBe('US');
    expect(facetValue(rec, 'language')).toBe('en');
    expect(matchesFacetFilters(rec, {})).toBe(true);
    expect(matchesFacetFilters(rec, { country: 'US' })).toBe(true);
    expect(matchesFacetFilters(rec, { country: 'IT' })).toBe(false);
    expect(matchesFacetFilters({ lang: 'el-GR', locale: 'en' }, { language: 'el' })).toBe(true);
    expect(facetValue({}, 'country')).toBe(FACET_UNKNOWN);
    expect(facetLabel('country', 'US')).toBe('United States');
    expect(uniqueFacetValues([rec, { country: 'IT' }, {}], 'country')).toEqual(['IT', 'US', FACET_UNKNOWN]);
  });
});
