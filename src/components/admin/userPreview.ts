import { bareCid } from '../../../api/_archive';

export { bareCid };

export type ArchiveFilter = 'active' | 'archived' | 'all';
export type ToolFilter = 'any' | 'dex' | 'league' | 'both';
export type ToolKind = 'dex' | 'league' | 'both';
export type PreviewLangKind = 'served' | 'unsupported' | 'switched';

export const FACET_KEYS = ['country', 'device', 'os', 'browser', 'language'] as const;
export type FacetKey = (typeof FACET_KEYS)[number];
export type FacetFilters = Partial<Record<FacetKey, string>>;

/** Missing country / device / OS / browser / language. Distinct from "any". */
export const FACET_UNKNOWN = '';

export const FACET_LABEL: Record<FacetKey, string> = {
  country: 'Country',
  device: 'Device',
  os: 'OS',
  browser: 'Browser',
  language: 'Language',
};

export const ARCHIVE_FILTER_OPTIONS: { key: ArchiveFilter; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
];

export const TOOL_FILTER_OPTIONS: { key: ToolFilter; label: string }[] = [
  { key: 'any', label: 'Any' },
  { key: 'dex', label: 'Only dex' },
  { key: 'league', label: 'Only league' },
  { key: 'both', label: 'Only both' },
];

export type PreviewPlatform = {
  country?: string;
  device?: string;
  os?: string;
  browser?: string;
  lang?: string;
  locale?: string;
  switched?: string;
};

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

export function facetValue(rec: PreviewPlatform, key: FacetKey): string {
  if (key === 'language') {
    const preview = previewLanguage(rec.lang, rec.locale, rec.switched);
    return preview ? preview.tag.split('-')[0].toLowerCase() : FACET_UNKNOWN;
  }
  const raw = rec[key];
  return raw ? raw.trim() : FACET_UNKNOWN;
}

export function matchesFacetFilters(rec: PreviewPlatform, filters: FacetFilters): boolean {
  for (const key of FACET_KEYS) {
    const want = filters[key];
    if (want === undefined) continue;
    if (facetValue(rec, key) !== want) return false;
  }
  return true;
}

export function uniqueFacetValues(recs: PreviewPlatform[], key: FacetKey): string[] {
  const seen = new Set<string>();
  for (const rec of recs) seen.add(facetValue(rec, key));
  return [...seen].sort((a, b) => {
    if (a === FACET_UNKNOWN) return 1;
    if (b === FACET_UNKNOWN) return -1;
    return facetLabel(key, a).localeCompare(facetLabel(key, b));
  });
}

export function sameBaseLang(a: string, b: string): boolean {
  return a.split('-')[0].toLowerCase() === b.split('-')[0].toLowerCase();
}

let langNames: Intl.DisplayNames | null | undefined;
/** Language name only, no tag: "es-ES" → "Spanish". Falls back to the tag. */
export function langName(tag?: string): string | undefined {
  if (!tag) return undefined;
  if (langNames === undefined) {
    try {
      langNames = new Intl.DisplayNames(['en'], { type: 'language' });
    } catch {
      langNames = null;
    }
  }
  try {
    const name = langNames?.of(tag.split('-')[0]);
    if (name) return name;
  } catch {
    /* unresolvable tag */
  }
  return tag;
}

let regionNames: Intl.DisplayNames | null | undefined;
/** Country name from an ISO code: "CZ" → "Czechia". Falls back to the code. */
export function countryName(code?: string): string | undefined {
  if (!code) return undefined;
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      regionNames = null;
    }
  }
  try {
    const name = regionNames?.of(code.toUpperCase());
    if (name) return name;
  } catch {
    /* unresolvable code */
  }
  return code;
}

export function facetLabel(key: FacetKey, value: string): string {
  if (value === FACET_UNKNOWN) return 'Unknown';
  if (key === 'country') return countryName(value) ?? value;
  if (key === 'language') return langName(value) ?? value;
  return value;
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
export const PREVIEW_SESSION_UNIT = { one: 'session', many: 'sessions' } as const;
export const PREVIEW_LEAGUE_NOUN = 'Gyms';

export const PREVIEW_FIT = {
  sessions: 99,
  totalMs: 5999 * 60_000,
  dex: 999,
  league: 14,
} as const;

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

/** Last-seen time in the user's timezone, with no seconds, plus the short
 *  zone name after the time. Falls back to the viewer's timezone when `tz`
 *  is missing or not a valid IANA zone. */
export function formatWhen(when: number, tz?: string, locale?: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  };
  const fromZone = (zone?: string): string | null => {
    try {
      const dtf = new Intl.DateTimeFormat(locale, zone ? { ...opts, timeZone: zone } : opts);
      const parts = dtf.formatToParts(when);
      const grab = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
      const month = grab('month');
      const day = grab('day');
      const hour = grab('hour');
      const minute = grab('minute');
      const period = grab('dayPeriod');
      const zoneName = grab('timeZoneName');
      const time = period ? `${hour}:${minute} ${period}` : `${hour}:${minute}`;
      const core = `${month} ${day}, ${time}`;
      return zoneName ? `${core} ${zoneName}` : core;
    } catch {
      return null;
    }
  };
  return (tz ? fromZone(tz) : null) ?? fromZone() ?? '';
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
