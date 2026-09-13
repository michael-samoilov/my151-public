import { bareCid } from '../../../api/_archive';

export { bareCid };

export type ArchiveFilter = 'active' | 'archived' | 'all';
export type ToolFilter = 'any' | 'dex' | 'league' | 'both';
export type ToolKind = 'dex' | 'league' | 'both';

export function toolKind(hasDex: boolean, hasLeague: boolean): ToolKind | null {
  if (hasDex && hasLeague) return 'both';
  if (hasDex) return 'dex';
  if (hasLeague) return 'league';
  return null;
}

export function matchesToolFilter(kind: ToolKind, filter: ToolFilter): boolean {
  if (filter === 'any') return true;
  return kind === filter;
}

export function matchesArchiveFilter(archived: boolean, filter: ArchiveFilter): boolean {
  if (filter === 'all') return true;
  return filter === 'archived' ? archived : !archived;
}

export function sessionChipLabel(sessions: number, totalMs: number): string {
  const sess = `${sessions} session${sessions === 1 ? '' : 's'}`;
  if (totalMs <= 0) return sess;
  return `${sess} · ${fmtDuration(totalMs)}`;
}

/** Last-seen time in the user's timezone, with no seconds. Falls back to the
 *  viewer's timezone when `tz` is missing or not a valid IANA zone. */
export function formatWhen(when: number, tz?: string, locale?: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
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
