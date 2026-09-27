import type { WhoBucket } from '../../api/_aggregate';
import { REGION_COLORS, REGIONS, regionOf, type Region } from '@/lib/countryRegions';
import { matchLocale, negotiateLocale } from '@/i18n/detect';

export type { WhoBucket };

/** Flag art is 18×12. A later flag stays unless it overlaps the previous one. */
export const FLAG_W = 18;
/** Names stay this far apart so the words do not collide. */
export const MARKER_GAP = 4;

export const OTHER_KEY = '\0other';

export const REGION_SHORT: Record<Region, string> = {
  'North America': 'North America',
  Europe: 'Europe',
  'Asia-Pacific': 'APAC',
  'Latin America': 'LATAM',
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
 * marker, left-aligned on that segment, does not overlap the previous marker.
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
    if (gap < 0) break;
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

/** A region slice lists Other. A device, OS, or browser slice leaves the remainder unlabeled. */
export function countryOtherLabeled(filter: WhoFilter | null): boolean {
  return filter == null || filter.dim === 'region';
}

/** Header for a Who slice. The pressed bar keeps its own name. */
export function amongTitle(label: string, filter: WhoFilter | null, ownDim?: WhoDim): string {
  if (!filter || filter.dim === ownDim) return label;
  return `${label} among ${filter.value}`;
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

/** Country totals inside the filter. A region press does not hide the other regions. */
export function countryCounts(buckets: readonly WhoBucket[], filter: WhoFilter | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const bucket of buckets) {
    if (bucket.n <= 0 || !bucket.country || !bucketInFilter(bucket, filter, 'region')) continue;
    const key = bucket.country.toUpperCase();
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
 * A region filter keeps that region.
 * No filter keeps every country. `defaultRegion` limits the bar only when it is set.
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

export function countryItems(countries: Record<string, number>, region: Region | null): FitItem[] {
  const items: FitItem[] = [];
  for (const [code, n] of Object.entries(countries)) {
    if (n <= 0) continue;
    if (region != null && regionOf(code) !== region) continue;
    items.push({ key: code.toUpperCase(), n });
  }
  return items;
}

const LEGACY_LANG = new Set(['iw', 'in', 'ji', 'jw']);

let spelledNames: Intl.DisplayNames | null | undefined;

/** The name the bar spells. `he`, `he-IL`, and `iw` are one language. */
export function spelledLanguage(tag: string): string {
  const base = tag.toLowerCase().split('-')[0] || tag;
  if (spelledNames === undefined) {
    try {
      spelledNames = new Intl.DisplayNames(['en'], { type: 'language' });
    } catch {
      spelledNames = null;
    }
  }
  try {
    const name = spelledNames?.of(base);
    if (name) return name;
  } catch {
    /* keep the tag */
  }
  return base;
}

function tagRank(tag: string): [number, number, number, string] {
  const raw = tag.toLowerCase();
  const base = raw.split('-')[0] || raw;
  return [LEGACY_LANG.has(base) ? 1 : 0, raw === base ? 0 : 1, raw.length, raw];
}

function preferTag(a: string, b: string): string {
  const ra = tagRank(a);
  const rb = tagRank(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] < rb[i]) return a;
    if (ra[i] > rb[i]) return b;
  }
  return a;
}

/** A pin that differs from the locale the tag would negotiate. */
export function isLanguageOverride(bucket: WhoBucket): boolean {
  return Boolean(bucket.switched && bucket.lang && negotiateLocale([bucket.lang]) !== bucket.switched);
}

export const LANGUAGE_SHARE_LABEL = {
  served: 'Served',
  unshipped: 'Unshipped',
  overrides: 'Overrides',
} as const;

/**
 * One 100% bar of the slice. Served leads. Unshipped and Overrides are the
 * problem share of everyone, and a user lands in only one of the three.
 */
export function languageShare(buckets: readonly WhoBucket[], region: Region | null): FitItem[] {
  let served = 0;
  let unshipped = 0;
  let overrides = 0;
  for (const bucket of buckets) {
    if (bucket.n <= 0) continue;
    if (region != null && regionOf(bucket.country) !== region) continue;
    if (isLanguageOverride(bucket)) overrides += bucket.n;
    else if (bucket.lang && matchLocale(bucket.lang) === null) unshipped += bucket.n;
    else served += bucket.n;
  }
  const items: FitItem[] = [];
  if (served > 0) items.push({ key: 'served', n: served });
  if (unshipped > 0) items.push({ key: 'unshipped', n: unshipped });
  if (overrides > 0) items.push({ key: 'overrides', n: overrides });
  return items;
}

/** Lay every item across the full width. Nothing folds into Other. */
export function proportionBar(items: readonly FitItem[], barWidthPx: number): FitSegment[] {
  const total = items.reduce((sum, it) => sum + it.n, 0);
  if (total <= 0 || barWidthPx <= 0) return [];
  let x = 0;
  return items.map((it, i) => {
    const widthPx = i === items.length - 1 ? Math.max(0, barWidthPx - x) : (it.n / total) * barWidthPx;
    const seg: FitSegment = {
      key: it.key,
      n: it.n,
      pct: Math.round((it.n / total) * 100),
      leftPx: x,
      widthPx,
    };
    x += widthPx;
    return seg;
  });
}

/** Browser tags the app does not ship. Tags that spell the same language are one segment. */
export function unshippedTags(buckets: readonly WhoBucket[], region: Region | null): FitItem[] {
  const groups = new Map<string, { n: number; tag: string }>();
  for (const bucket of buckets) {
    if (!bucket.lang || bucket.n <= 0) continue;
    if (region != null && regionOf(bucket.country) !== region) continue;
    if (isLanguageOverride(bucket)) continue;
    if (matchLocale(bucket.lang) !== null) continue;
    const spell = spelledLanguage(bucket.lang);
    const cur = groups.get(spell);
    if (cur) {
      cur.n += bucket.n;
      cur.tag = preferTag(cur.tag, bucket.lang);
    } else groups.set(spell, { n: bucket.n, tag: bucket.lang });
  }
  return [...groups.values()].map((group) => ({ key: group.tag, n: group.n }));
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
    if (!isLanguageOverride(bucket)) continue;
    const country = bucket.country.toUpperCase();
    const k = `${spelledLanguage(bucket.lang)}\t${spelledLanguage(bucket.switched)}\t${country}`;
    const cur = map.get(k);
    if (cur) {
      cur.n += bucket.n;
      cur.lang = preferTag(cur.lang, bucket.lang);
      cur.switched = preferTag(cur.switched, bucket.switched);
    } else map.set(k, { lang: bucket.lang, switched: bucket.switched, country, n: bucket.n });
  }
  return [...map.values()].sort(
    (a, b) => b.n - a.n || a.lang.localeCompare(b.lang) || a.country.localeCompare(b.country),
  );
}

/** Full name, short code, or nothing. The short code is the fallback. */
export function captionKind(fullPx: number, shortPx: number, roomPx: number): 'full' | 'short' | 'none' {
  if (fullPx <= roomPx) return 'full';
  if (shortPx <= roomPx) return 'short';
  return 'none';
}

/** Pixels between a marker's right edge and the next limit, after the word gap. */
export function markerRoom(markerLeft: number, markerWidth: number, limitPx: number): number {
  return limitPx - (markerLeft + markerWidth + MARKER_GAP);
}

/**
 * Room for a country name after its flag. The limit is the next flag, or the
 * Other stem when this flag is the last one on the bar.
 */
export function countryRooms(
  segments: readonly FitSegment[],
  barWidthPx: number,
  labelOther = true,
): Record<string, number> {
  const shown = segments.filter((seg) => seg.key !== OTHER_KEY);
  const other = segments.find((seg) => seg.key === OTHER_KEY);
  let end = barWidthPx;
  if (other) end = labelOther ? other.leftPx + Math.max(0, other.widthPx - 6) : other.leftPx;
  const rooms: Record<string, number> = {};
  for (let i = 0; i < shown.length; i++) {
    const seg = shown[i];
    const limit = i + 1 < shown.length ? shown[i + 1].leftPx : end;
    rooms[seg.key] = markerRoom(seg.leftPx, FLAG_W, limit);
  }
  return rooms;
}

/** Distinct countries on the country bar. */
export function countryHeaderCount(
  buckets: readonly WhoBucket[],
  filter: WhoFilter | null,
  defaultRegion: Region | null,
): number {
  const all = new Set<string>();
  for (const bucket of visibleBuckets(buckets, filter, defaultRegion)) {
    if (bucket.country && bucket.n > 0) all.add(bucket.country.toUpperCase());
  }
  return all.size;
}

/** Region with the most users of this language in the buckets already sliced. */
export function primaryLanguageRegion(buckets: readonly WhoBucket[], lang: string): Region {
  const totals = new Map<Region, number>();
  const spell = spelledLanguage(lang);
  for (const bucket of buckets) {
    if (!bucket.lang || bucket.n <= 0 || spelledLanguage(bucket.lang) !== spell) continue;
    const region = regionOf(bucket.country);
    totals.set(region, (totals.get(region) ?? 0) + bucket.n);
  }
  let best: Region = 'Unknown';
  let bestN = 0;
  for (const region of [...REGIONS, 'Unknown' as const]) {
    const n = totals.get(region) ?? 0;
    if (n > bestN) {
      best = region;
      bestN = n;
    }
  }
  return best;
}

function spanWidth(widths: readonly number[], gapPx: number, from: number, to: number): number {
  let width = 0;
  for (let i = from; i < to; i++) width += widths[i] + (i > from ? gapPx : 0);
  return width;
}

function betterRank(next: number[], prev: number[]): boolean {
  for (let i = 0; i < next.length; i++) {
    if (next[i] !== prev[i]) return next[i] < prev[i];
  }
  return false;
}

/**
 * Contiguous rows of similar width. One row when everything fits.
 * The top row is the longest. Every row stays inside the container
 * unless it is a single item.
 */
export function balanceRailRows(widths: readonly number[], gapPx: number, containerPx: number): number[][] {
  const n = widths.length;
  if (n === 0) return [];
  const all = widths.map((_, i) => i);
  if (!(containerPx > 0) || spanWidth(widths, gapPx, 0, n) <= containerPx + 0.5) return [all];

  let minRows = 1;
  let start = 0;
  for (let i = 1; i <= n; i++) {
    if (spanWidth(widths, gapPx, start, i) > containerPx + 0.5 && i - 1 > start) {
      minRows += 1;
      start = i - 1;
    }
  }

  const rowFits = (group: number[]) =>
    group.length <= 1 || spanWidth(widths, gapPx, group[0], group[group.length - 1] + 1) <= containerPx + 0.5;

  const walk = (rowsLeft: number) => {
    let bestRows: number[][] | null = null;
    let bestRank: number[] | null = null;
    let bestLongest = false;
    const consider = (groups: number[][]) => {
      if (groups.some((group) => !rowFits(group))) return;
      const rowWidths = groups.map((group) => spanWidth(widths, gapPx, group[0], group[group.length - 1] + 1));
      const top = rowWidths[0];
      const lowerMax = rowWidths.length > 1 ? Math.max(...rowWidths.slice(1)) : -1;
      const topLongest = rowWidths.length === 1 || top > lowerMax + 0.5;
      const maxW = Math.max(...rowWidths);
      const rank = [topLongest ? 0 : 1, maxW, ...rowWidths.map((width) => -width)];
      if (!bestRank || betterRank(rank, bestRank)) {
        bestRank = rank;
        bestRows = groups;
        bestLongest = topLongest;
      }
    };
    const place = (from: number, left: number, acc: number[][]) => {
      if (left === 1) {
        consider([...acc, all.slice(from)]);
        return;
      }
      const lastStart = n - (left - 1);
      for (let end = from + 1; end <= lastStart; end++) {
        const group = all.slice(from, end);
        if (!rowFits(group)) continue;
        place(end, left - 1, [...acc, group]);
      }
    };
    place(0, rowsLeft, []);
    return { bestRows, bestLongest };
  };

  let fallback: number[][] | null = null;
  for (let rows = minRows; rows <= n; rows++) {
    const { bestRows, bestLongest } = walk(rows);
    if (bestRows) fallback = bestRows;
    if (bestRows && bestLongest) return bestRows;
  }
  return fallback ?? [all];
}

/** Left-align each name on its segment. A name may hang past a short segment. */
export function layoutNameLabels(
  slices: readonly { key: string; leftPx: number; widthPx: number }[],
  widths: readonly number[],
  barWidthPx: number,
): NameLabel[] {
  const placed = slices.map((slice, i) => {
    const widthPx = widths[i] ?? 0;
    return { key: slice.key, leftPx: slice.leftPx, widthPx };
  });
  if (placed.length === 0 || barWidthPx <= 0) return placed;
  for (let i = 1; i < placed.length; i++) {
    const minLeft = placed[i - 1].leftPx + placed[i - 1].widthPx + MARKER_GAP;
    if (placed[i].leftPx < minLeft) placed[i].leftPx = minLeft;
  }
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
