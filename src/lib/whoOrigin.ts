import type { WhoBucket } from '../../api/_aggregate';
import { REGION_COLORS, REGIONS, regionOf, type Region } from '@/lib/countryRegions';
import { matchLocale, negotiateLocale } from '@/i18n/detect';

export type { WhoBucket };

/** Flag art is 18×12. A later flag stays when it clears the previous one by this gap. */
export const FLAG_W = 18;
export const MARKER_GAP = 4;

export const OTHER_KEY = '\0other';

export const REGION_SHORT: Record<Region, string> = {
  'North America': 'North America',
  Europe: 'Europe',
  'Asia-Pacific': 'APAC',
  'Latin America': 'Latin America',
  'Middle East & Africa': 'ME&A',
  Unknown: 'Unknown',
};

export interface FitItem {
  key: string;
  n: number;
}

export interface FitSegment {
  key: string;
  n: number;
  leftPx: number;
  widthPx: number;
  folded?: FitItem[];
}

export interface NameLabel {
  key: string;
  leftPx: number;
  widthPx: number;
}

export interface OverrideRow {
  lang: string;
  switched: string;
  country: string;
  n: number;
}

/**
 * Walk largest to smaller. Keep the next marker while the gap in front of it
 * is at least 4px. That gap is the previous segment width minus the previous
 * marker width. The first item that would overlap, and every smaller item,
 * folds into one Other segment. Widths are drawn again after that cut.
 */
export function fitBar(
  items: readonly FitItem[],
  barWidthPx: number,
  markerWidth: (key: string) => number,
): FitSegment[] {
  const ranked = items
    .filter((it) => it.n > 0 && it.key !== OTHER_KEY)
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
  if (ranked.length === 0 || barWidthPx <= 0) return [];
  const total = ranked.reduce((sum, it) => sum + it.n, 0);
  const widths = ranked.map((it) => (it.n / total) * barWidthPx);
  let cut = ranked.length;
  for (let i = 1; i < ranked.length; i++) {
    const gap = widths[i - 1] - markerWidth(ranked[i - 1].key);
    if (gap < MARKER_GAP) {
      cut = i;
      break;
    }
  }
  const kept = ranked.slice(0, cut);
  const folded = ranked.slice(cut);
  const shown: FitItem[] = folded.length
    ? [...kept, { key: OTHER_KEY, n: folded.reduce((sum, it) => sum + it.n, 0) }]
    : kept;
  const shownTotal = shown.reduce((sum, it) => sum + it.n, 0);
  let x = 0;
  return shown.map((it, i) => {
    const widthPx = i === shown.length - 1 ? Math.max(0, barWidthPx - x) : (it.n / shownTotal) * barWidthPx;
    const seg: FitSegment = { key: it.key, n: it.n, leftPx: x, widthPx };
    if (it.key === OTHER_KEY) seg.folded = folded;
    x += widthPx;
    return seg;
  });
}

/** A share under 10% keeps one decimal. The % sign is optional. */
export function formatShare(n: number, total: number, withSign: boolean): string {
  const pct = total > 0 ? (n / total) * 100 : 0;
  const text = pct < 10 ? (Math.round(pct * 10) / 10).toFixed(1) : String(Math.round(pct));
  return withSign ? `${text}%` : text;
}

export function distinctCountries(countries: Record<string, number>): number {
  const seen = new Set<string>();
  for (const [code, n] of Object.entries(countries)) {
    if (n > 0 && code) seen.add(code.toUpperCase());
  }
  return seen.size;
}

export interface RegionSlice {
  key: Region;
  label: string;
  n: number;
  leftPx: number;
  widthPx: number;
  color: string;
}

function regionRank(region: Region): number {
  const i = REGIONS.indexOf(region as (typeof REGIONS)[number]);
  return i < 0 ? REGIONS.length : i;
}

export function regionBar(countries: Record<string, number>, barWidthPx: number): RegionSlice[] {
  const counts = new Map<Region, number>();
  for (const [code, n] of Object.entries(countries)) {
    if (n <= 0) continue;
    const region = regionOf(code);
    counts.set(region, (counts.get(region) ?? 0) + n);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || regionRank(a[0]) - regionRank(b[0]));
  const total = ranked.reduce((sum, [, n]) => sum + n, 0);
  if (total <= 0 || barWidthPx <= 0) return [];
  let x = 0;
  return ranked.map(([key, n], i) => {
    const widthPx = i === ranked.length - 1 ? Math.max(0, barWidthPx - x) : (n / total) * barWidthPx;
    const seg: RegionSlice = {
      key,
      label: REGION_SHORT[key],
      n,
      leftPx: x,
      widthPx,
      color: REGION_COLORS[key],
    };
    x += widthPx;
    return seg;
  });
}

export function countryItems(countries: Record<string, number>, region: Region): FitItem[] {
  const items: FitItem[] = [];
  for (const [code, n] of Object.entries(countries)) {
    if (n <= 0) continue;
    if (regionOf(code) !== region) continue;
    items.push({ key: code.toUpperCase(), n });
  }
  return items;
}

/** Browser tags the app does not ship, inside one region. */
export function unshippedTags(buckets: readonly WhoBucket[], region: Region): FitItem[] {
  const counts = new Map<string, number>();
  for (const bucket of buckets) {
    if (!bucket.lang || bucket.n <= 0) continue;
    if (regionOf(bucket.country) !== region) continue;
    if (matchLocale(bucket.lang) !== null) continue;
    counts.set(bucket.lang, (counts.get(bucket.lang) ?? 0) + bucket.n);
  }
  return [...counts.entries()].map(([key, n]) => ({ key, n }));
}

/**
 * A pin is an override only when `switched` differs from the locale negotiation
 * would serve for that browser tag. A pin that matches negotiation stays out.
 */
export function languageOverrides(buckets: readonly WhoBucket[], region: Region): OverrideRow[] {
  const map = new Map<string, OverrideRow>();
  for (const bucket of buckets) {
    if (!bucket.switched || !bucket.lang || bucket.n <= 0) continue;
    if (regionOf(bucket.country) !== region) continue;
    if (negotiateLocale([bucket.lang]) === bucket.switched) continue;
    const country = bucket.country.toUpperCase();
    const k = `${bucket.lang}\t${bucket.switched}\t${country}`;
    const cur = map.get(k);
    if (cur) cur.n += bucket.n;
    else map.set(k, { lang: bucket.lang, switched: bucket.switched, country, n: bucket.n });
  }
  return [...map.values()].sort(
    (a, b) => b.n - a.n || a.lang.localeCompare(b.lang) || a.country.localeCompare(b.country),
  );
}

/** Place each name on its segment. A name that does not fit extends to the left. */
export function layoutNameLabels(
  slices: readonly { key: string; leftPx: number; widthPx: number }[],
  widths: readonly number[],
  barWidthPx: number,
): NameLabel[] {
  const placed = slices.map((slice, i) => {
    const widthPx = widths[i] ?? 0;
    const fits = widthPx <= slice.widthPx;
    const preferred = fits ? slice.leftPx + (slice.widthPx - widthPx) / 2 : slice.leftPx + slice.widthPx - widthPx;
    return { key: slice.key, leftPx: preferred, widthPx };
  });
  if (placed.length === 0 || barWidthPx <= 0) return placed;
  const last = placed[placed.length - 1];
  if (last.leftPx + last.widthPx > barWidthPx) last.leftPx = barWidthPx - last.widthPx;
  for (let i = placed.length - 2; i >= 0; i--) {
    const maxLeft = placed[i + 1].leftPx - MARKER_GAP - placed[i].widthPx;
    if (placed[i].leftPx > maxLeft) placed[i].leftPx = maxLeft;
  }
  if (placed[0].leftPx < 0) {
    placed[0].leftPx = 0;
    for (let i = 1; i < placed.length; i++) {
      const minLeft = placed[i - 1].leftPx + placed[i - 1].widthPx + MARKER_GAP;
      if (placed[i].leftPx < minLeft) placed[i].leftPx = minLeft;
    }
  }
  return placed;
}
