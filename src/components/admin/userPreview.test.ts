import { describe, expect, it } from 'vitest';
import { formatWhen, fmtDuration, leagueExported, sessionTotalMs } from './userPreview';

describe('formatWhen', () => {
  const ts = Date.UTC(2026, 8, 10, 16, 5, 45);

  it('omits seconds', () => {
    const s = formatWhen(ts, 'UTC', 'en-US');
    expect(s).not.toMatch(/\d:\d{2}:\d{2}/);
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
