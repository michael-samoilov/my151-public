import { bareCid } from '../../../api/_archive';
import { FAVORITE_TOTAL_CELLS } from '../../../api/_favoriteRecord';
import { CARD_COUNT } from '../../../api/_leagueRecord';
import { DEX_TOTAL } from '@/lib/milestones';
import iso31662En from './iso3166-2-en.json';

export { bareCid };

const SUBDIVISION_EN = iso31662En as Record<string, string>;
const ISO_3166_2 = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;
const ISO_SUBDIVISION = /^[A-Z0-9]{1,3}$/;

export type ArchiveFilter = 'active' | 'pageloads' | 'automation' | 'archived' | 'all';
export type ToolFilter = 'any' | 'dex' | 'league' | 'picker';
export type PreviewLangKind = 'served' | 'unsupported' | 'switched';

export const FACET_KEYS = ['country', 'device', 'os', 'browser', 'language'] as const;
export type FacetKey = (typeof FACET_KEYS)[number];
export type FacetFilters = Partial<Record<FacetKey, string>>;

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
  { key: 'pageloads', label: 'Page loads' },
  { key: 'automation', label: 'Bot leads' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
];

export const TOOL_FILTER_OPTIONS: { key: ToolFilter; label: string }[] = [
  { key: 'any', label: 'Any' },
  { key: 'dex', label: 'Dex' },
  { key: 'league', label: 'League' },
  { key: 'picker', label: 'Picker' },
];

type PreviewPlatform = {
  country?: string;
  device?: string;
  os?: string;
  browser?: string;
  lang?: string;
  locale?: string;
  switched?: string;
};

export function matchesToolFilter(row: { dex?: unknown; league?: unknown; picker?: unknown }, filter: ToolFilter): boolean {
  return filter === 'any' || !!row[filter];
}

/** Active rows are the browsers the counts include. Page loads never placed a
 *  Pokémon or gave real input; bot leads look automated (api/_visitorQuality.ts). */
export function matchesArchiveFilter(
  archived: boolean,
  filter: ArchiveFilter,
  row: { pageLoadOnly?: boolean; suspect?: readonly string[] } = {},
): boolean {
  if (filter === 'all') return true;
  if (filter === 'archived') return archived;
  if (archived) return false;
  if (filter === 'pageloads') return !!row.pageLoadOnly;
  if (filter === 'automation') return !!row.suspect?.length;
  return !row.pageLoadOnly;
}

const SUSPECT_TEXT: Record<string, string> = {
  burst: 'one of 3+ look-alike new browsers within 10 minutes',
  'no-language': 'sent no language header',
};

export function suspectText(reasons: readonly string[]): string {
  return `Bot lead: ${reasons.map((r) => SUSPECT_TEXT[r] ?? r).join('; ')}`;
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
    return tag;
  }
  return tag;
}

let regionNames: Intl.DisplayNames | null | undefined;
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
    return code;
  }
  return code;
}

export function subregionName(country?: string, region?: string): string | undefined {
  if (!region) return undefined;
  const raw = region.trim();
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  let iso: string | undefined;
  if (ISO_3166_2.test(upper)) iso = upper;
  else if (ISO_SUBDIVISION.test(upper) && country && /^[A-Z]{2}$/i.test(country.trim())) {
    iso = `${country.trim().toUpperCase()}-${upper}`;
  } else {
    return raw;
  }
  return SUBDIVISION_EN[iso] ?? raw;
}

export function geoChipLabel(country?: string, region?: string): string {
  const countryLabel = countryName(country);
  const sub = subregionName(country, region);
  if (countryLabel && sub) return `${countryLabel} · ${sub}`;
  return countryLabel ?? sub ?? '';
}

export function uiLanguage(lang?: string, locale?: string, switched?: string): string | undefined {
  return switched || locale || lang;
}

export function facetLabel(key: FacetKey, value: string): string {
  if (value === FACET_UNKNOWN) return 'Unknown';
  if (key === 'country') return countryName(value) ?? value;
  if (key === 'language') return langName(value) ?? value;
  return value;
}

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

export function fmtChipDuration(ms: number): string {
  if (ms < 45_000) return '0m';
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60 ? ` ${m % 60}m` : ''}`;
}

const PREVIEW_SESSION_UNIT = { one: 'session', many: 'sessions' } as const;

export const PREVIEW_PROGRESS = {
  dex: { of: DEX_TOTAL, noun: 'Dex' },
  league: { of: CARD_COUNT, noun: 'Gyms' },
  picker: { of: FAVORITE_TOTAL_CELLS, noun: 'Favs' },
} as const;

export const PREVIEW_FIT = {
  sessions: 99,
  totalMs: 5999 * 60_000,
  dex: 999,
  league: 14,
  picker: FAVORITE_TOTAL_CELLS,
} as const;

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
