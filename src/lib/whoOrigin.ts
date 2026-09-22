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
  pct: number;
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

function placeSegments(shown: FitItem[], folded: FitItem[], barWidthPx: number): FitSegment[] {
  const shownTotal = shown.reduce((sum, it) => sum + it.n, 0);
  let x = 0;
  return shown.map((it, i) => {
    const widthPx = i === shown.length - 1 ? Math.max(0, barWidthPx - x) : (it.n / shownTotal) * barWidthPx;
    const seg: FitSegment = {
      key: it.key,
      n: it.n,
      pct: shownTotal > 0 ? Math.round((it.n / shownTotal) * 100) : 0,
      leftPx: x,
      widthPx,
    };
    if (it.key === OTHER_KEY) seg.folded = folded;
    x += widthPx;
    return seg;
  });
}

/** Kept items stay separate. Everything after them is one Other segment. */
function trialBar(ranked: readonly FitItem[], keepCount: number, barWidthPx: number): FitSegment[] {
  const kept = ranked.slice(0, keepCount);
  const folded = ranked.slice(keepCount);
  const shown: FitItem[] = folded.length
    ? [...kept, { key: OTHER_KEY, n: folded.reduce((sum, it) => sum + it.n, 0) }]
    : kept;
  return placeSegments(shown, folded, barWidthPx);
}

/**
 * Walk largest to smaller. Try the next item as its own segment, with Other
 * holding only the items after it, and draw those widths. Keep it while its
 * marker, left-aligned on that segment, clears the previous marker by 4px.
 * A marker may hang past its segment. The first overlap, and every smaller
 * item, folds into Other.
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
  let keep = 1;
  for (let i = 1; i < ranked.length; i++) {
    const segs = trialBar(ranked, i + 1, barWidthPx);
    const prev = segs[i - 1];
    const curr = segs[i];
    const gap = curr.leftPx - (prev.leftPx + markerWidth(prev.key));
    if (gap < MARKER_GAP) break;
    keep = i + 1;
  }
  return trialBar(ranked, keep, barWidthPx);
}

/** A share under 10% keeps one decimal. The % sign is optional. */
export function formatShare(n: number, total: number, withSign: boolean): string {
  const pct = total > 0 ? (n / total) * 100 : 0;
  const text = pct < 10 ? (Math.round(pct * 10) / 10).toFixed(1) : String(Math.round(pct));
  return withSign ? `${text}%` : text;
}

export type WhoDim = 'device' | 'os' | 'browser' | 'region';

export interface WhoFilter {
  dim: WhoDim;
  value: string;
}

export function bucketValue(bucket: WhoBucket, dim: WhoDim): string {
  if (dim === 'region') return regionOf(bucket.country);
  if (dim === 'device') return bucket.device || 'Unknown';
  if (dim === 'os') return bucket.os || 'Unknown';
  return bucket.browser || 'Unknown';
}

/** True when the bucket belongs in this chart. The driving chart keeps its full mix. */
export function bucketInFilter(bucket: WhoBucket, filter: WhoFilter | null, driving?: WhoDim): boolean {
  if (!filter || filter.dim === driving) return true;
  return bucketValue(bucket, filter.dim) === filter.value;
}

export function mixWho(
  buckets: readonly WhoBucket[],
  dim: WhoDim,
  filter: WhoFilter | null,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const bucket of buckets) {
    if (bucket.n <= 0 || !bucketInFilter(bucket, filter, dim)) continue;
    const key = bucketValue(bucket, dim);
    if (!key) continue;
    out[key] = (out[key] ?? 0) + bucket.n;
  }
  return out;
}

export function filteredN(buckets: readonly WhoBucket[], filter: WhoFilter | null): number {
  return buckets.reduce((sum, bucket) => sum + (bucketInFilter(bucket, filter) ? bucket.n : 0), 0);
}

/**
 * Buckets for the country bar, Unshipped, and Overrides.
 * A platform filter keeps every country in that slice.
 * A region filter, or no filter, keeps one region. The default region is the largest.
 */
export function visibleBuckets(
  buckets: readonly WhoBucket[],
  filter: WhoFilter | null,
  defaultRegion: Region | null,
): WhoBucket[] {
  const platform = filter != null && filter.dim !== 'region';
  const region = filter?.dim === 'region' ? filter.value : defaultRegion;
  return buckets.filter((bucket) => {
    if (bucket.n <= 0 || !bucketInFilter(bucket, filter)) return false;
    if (platform) return true;
    if (!region) return true;
    return regionOf(bucket.country) === region;
  });
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
  pct: number;
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
      pct: Math.round((n / total) * 100),
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

/** Browser tags the app does not ship. `region` null keeps every country in the list. */
export function unshippedTags(buckets: readonly WhoBucket[], region: Region | null): FitItem[] {
  const counts = new Map<string, number>();
  for (const bucket of buckets) {
    if (!bucket.lang || bucket.n <= 0) continue;
    if (region != null && regionOf(bucket.country) !== region) continue;
    if (matchLocale(bucket.lang) !== null) continue;
    counts.set(bucket.lang, (counts.get(bucket.lang) ?? 0) + bucket.n);
  }
  return [...counts.entries()].map(([key, n]) => ({ key, n }));
}

/**
 * A pin is an override only when `switched` differs from the locale negotiation
 * would serve for that browser tag. A pin that matches negotiation stays out.
 */
export function languageOverrides(buckets: readonly WhoBucket[], region: Region | null): OverrideRow[] {
  const map = new Map<string, OverrideRow>();
  for (const bucket of buckets) {
    if (!bucket.switched || !bucket.lang || bucket.n <= 0) continue;
    if (region != null && regionOf(bucket.country) !== region) continue;
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
