/** Last-seen time in the user's timezone, with no seconds. Falls back to the
 *  viewer's timezone when `tz` is missing or not a valid IANA zone. */
export function formatWhen(when: number, tz?: string, locale?: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  };
  if (tz) {
    try {
      return new Intl.DateTimeFormat(locale, { ...opts, timeZone: tz }).format(when);
    } catch {
      // invalid IANA zone — fall through
    }
  }
  return new Intl.DateTimeFormat(locale, opts).format(when);
}

export function sessionTotalMs(sessionMs?: number[]): number {
  return (sessionMs ?? []).reduce((a, b) => a + b, 0);
}

/** Compact duration: 45s, 3m, 1h 5m. */
export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60 ? ` ${m % 60}m` : ''}`;
}

export function leagueExported(exportsCard: number, exportsLeague: number): boolean {
  return exportsCard > 0 || exportsLeague > 0;
}
