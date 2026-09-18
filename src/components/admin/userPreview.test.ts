import { describe, expect, it } from 'vitest';
import {
  dexChipLabel,
  dexPokemonCount,
  formatWhen,
  fmtChipDuration,
  fmtDuration,
  leagueChipLabel,
  leagueExported,
  matchesArchiveFilter,
  matchesToolFilter,
  mergedSessionStats,
  uniqueFacetValues,
  matchesFacetFilters,
  facetValue,
  facetLabel,
  FACET_UNKNOWN,
  previewLanguage,
  sessionChipParts,
  sessionTotalMs,
  subregionName,
  geoChipLabel,
  uiLanguage,
  toolKind,
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

  it('uses the user timezone', () => {
    const s = formatWhen(ts, 'America/New_York', 'en-US');
    expect(s).toMatch(/12:05\sPM/);
  });

  it('falls back when the zone is invalid', () => {
    const s = formatWhen(ts, 'Not/AZone', 'en-US');
    expect(s).toMatch(/4:05\sPM|12:05\sPM/);
  });
});

describe('sessionTotalMs', () => {
  it('sums session lengths', () => {
    expect(sessionTotalMs([60_000, 120_000])).toBe(180_000);
  });

  it('treats a missing list as zero', () => {
    expect(sessionTotalMs(undefined)).toBe(0);
  });
});

describe('fmtDuration', () => {
  it('formats a total in hours and minutes', () => {
    expect(fmtDuration(7_440_000)).toBe('2h 4m');
  });
});

describe('leagueExported', () => {
  it('is true when either export kind happened', () => {
    expect(leagueExported(1, 0)).toBe(true);
    expect(leagueExported(0, 2)).toBe(true);
    expect(leagueExported(0, 0)).toBe(false);
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

describe('dexPokemonCount', () => {
  it('counts Pokémon in the latest dex, not evolution lines', () => {
    expect(dexPokemonCount([25, 26])).toBe(2);
    expect(dexPokemonCount([])).toBe(0);
    expect(dexPokemonCount(undefined)).toBe(0);
  });
});

describe('preview chip labels', () => {
  it('names Dex, sessions, and Gyms', () => {
    expect(dexChipLabel(0)).toBe('0 Dex');
    expect(dexChipLabel(999)).toBe('999 Dex');
    expect(leagueChipLabel(0, 14)).toBe('0/14 Gyms');
    expect(leagueChipLabel(14, 14)).toBe('14/14 Gyms');
    expect(sessionChipParts(1, 0)).toEqual({ count: 1, unit: 'session', duration: '0m' });
    expect(sessionChipParts(99, 5999 * 60 * 1000)).toEqual({
      count: 99,
      unit: 'sessions',
      duration: '99h 59m',
    });
  });
});

describe('mergedSessionStats', () => {
  it('adds dex and league sessions and time', () => {
    expect(
      mergedSessionStats({ sessions: 1, sessionMs: [] }, { sessions: 2, sessionMs: [60_000, 120_000] }),
    ).toEqual({ sessions: 3, totalMs: 180_000 });
  });
});

describe('subregionName', () => {
  it('expands a known ISO 3166-2 code to the full term', () => {
    expect(subregionName('AU', 'VIC')).toBe('Victoria');
    expect(subregionName('US', 'NJ')).toBe('New Jersey');
    expect(subregionName('BR', 'SP')).toBe('São Paulo');
  });

  it('keeps a code that has no full name', () => {
    expect(subregionName('AU', 'ZZZ')).toBe('ZZZ');
  });

  it('keeps a display name that is not an ISO code', () => {
    expect(subregionName('US', 'N. America')).toBe('N. America');
    expect(subregionName('IT', 'Europe')).toBe('Europe');
  });
});

describe('geoChipLabel', () => {
  it('joins the country with the full subregion term', () => {
    expect(geoChipLabel('AU', 'VIC')).toBe('Australia · Victoria');
    expect(geoChipLabel('US', 'N. America')).toBe('United States · N. America');
  });
});

describe('uiLanguage', () => {
  it('shows the served UI language when the browser language differs', () => {
    expect(uiLanguage('pt', 'en')).toBe('en');
  });

  it('shows a language the user switched to', () => {
    expect(uiLanguage('pt', 'en', 'ja')).toBe('ja');
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

  it('prefers switched over unsupported when a supported locale was pinned', () => {
    // French browser + English served would look "unsupported" without switched.
    expect(previewLanguage('fr-FR', 'en', 'en')).toEqual({ kind: 'switched', tag: 'en' });
  });
});

describe('preview filters', () => {
  it('classifies dex, league, and both', () => {
    expect(toolKind(true, false)).toBe('dex');
    expect(toolKind(false, true)).toBe('league');
    expect(toolKind(true, true)).toBe('both');
    expect(toolKind(false, false)).toBe(null);
  });

  it('hides archived rows on the active filter', () => {
    expect(matchesArchiveFilter(false, 'active')).toBe(true);
    expect(matchesArchiveFilter(true, 'active')).toBe(false);
    expect(matchesArchiveFilter(true, 'archived')).toBe(true);
    expect(matchesArchiveFilter(false, 'all')).toBe(true);
  });

  it('matches a tool filter against presence', () => {
    expect(matchesToolFilter('both', 'any')).toBe(true);
    expect(matchesToolFilter('dex', 'dex')).toBe(true);
    expect(matchesToolFilter('dex', 'league')).toBe(false);
    expect(matchesToolFilter('both', 'both')).toBe(true);
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
