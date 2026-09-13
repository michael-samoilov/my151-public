import { describe, expect, it } from 'vitest';
import {
  dexChipLabel,
  formatWhen,
  fmtChipDuration,
  fmtDuration,
  leagueChipLabel,
  leagueExported,
  matchesArchiveFilter,
  matchesToolFilter,
  mergedSessionStats,
  previewLanguage,
  sessionChipParts,
  sessionTotalMs,
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

describe('preview chip labels', () => {
  it('names Dex, sesh, and gyms', () => {
    expect(dexChipLabel(999)).toBe('999 Dex');
    expect(leagueChipLabel(14, 14)).toBe('14/14 gyms');
    expect(sessionChipParts(1, 0)).toEqual({ count: 1, unit: 'sesh', duration: '0m' });
    expect(sessionChipParts(99, 5999 * 60 * 1000)).toEqual({
      count: 99,
      unit: 'sesh',
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
});
