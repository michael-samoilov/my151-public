import { bareCid } from '../../../api/_archive';

export { bareCid };

export type ArchiveFilter = 'active' | 'archived' | 'all';
export type ToolFilter = 'any' | 'dex' | 'league' | 'both';
export type ToolKind = 'dex' | 'league' | 'both';
export type PreviewLangKind = 'served' | 'unsupported' | 'switched';

export type SessionSlice = { sessions?: number; sessionMs?: number[] };

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

export function sameBaseLang(a: string, b: string): boolean {
  return a.split('-')[0].toLowerCase() === b.split('-')[0].toLowerCase();
}

/** One language for a preview card. Detail still shows the full path. */
export function previewLanguage(
  lang?: string,
  locale?: string,
  switched?: string,
): { kind: PreviewLangKind; tag: string } | null {
  if (switched) return { kind: 'switched', tag: switched };
  if (lang && locale && !sameBaseLang(lang, locale)) return { kind: 'unsupported', tag: lang };
  const tag = locale || lang;
  if (!tag) return null;
  return { kind: 'served', tag };
}

export function sessionTotalMs(sessionMs?: number[]): number {
  return (sessionMs ?? []).reduce((a, b) => a + b, 0);
}

export function mergedSessionStats(...parts: Array<SessionSlice | undefined>): {
  sessions: number;
  totalMs: number;
} {
  let sessions = 0;
  let totalMs = 0;
  for (const p of parts) {
    if (!p) continue;
    const ms = p.sessionMs ?? [];
    totalMs += sessionTotalMs(ms);
    sessions += p.sessions ?? ms.length;
  }
  return { sessions, totalMs };
}

/** Minutes for a preview chip. Under 45s is 0m, so a card always shows time. */
export function fmtChipDuration(ms: number): string {
  if (ms < 45_000) return '0m';
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60 ? ` ${m % 60}m` : ''}`;
}

export const PREVIEW_DEX_NOUN = 'Dex';
export const PREVIEW_SESSION_UNIT = { one: 'sesh', many: 'sesh' } as const;
export const PREVIEW_LEAGUE_NOUN = 'gyms';

export function dexChipLabel(count: number): string {
  return `${count} ${PREVIEW_DEX_NOUN}`;
}

export function leagueChipLabel(count: number, of: number): string {
  return `${count}/${of} ${PREVIEW_LEAGUE_NOUN}`;
}

export function sessionChipParts(
  sessions: number,
  totalMs: number,
): { count: number; unit: string; duration: string } {
  return {
    count: sessions,
    unit: sessions === 1 ? PREVIEW_SESSION_UNIT.one : PREVIEW_SESSION_UNIT.many,
    duration: fmtChipDuration(totalMs),
  };
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
