import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlagIcon, TooltipScope, useTooltipChip } from '@/components/admin/platformIcons';
import { countryName } from '@/components/admin/userPreview';
import type { WhoBucket } from '../../../api/_aggregate';
import { REGION_COLORS, regionOf, type Region } from '@/lib/countryRegions';
import { inBarKind, inkOn, muteColor } from '@/lib/platformStacks';
import { cn } from '@/lib/utils';
import {
  FLAG_W,
  OTHER_KEY,
  countryItems,
  distinctCountries,
  fitBar,
  formatShare,
  languageOverrides,
  layoutNameLabels,
  mixWho,
  regionBar,
  unshippedTags,
  visibleBuckets,
  type FitSegment,
  type WhoFilter,
} from '@/lib/whoOrigin';

const TITLE = 'text-xs font-bold uppercase tracking-wide text-muted-foreground';
const PRESSED_INSET = 3;

function FlagTip({ country }: { country: string }) {
  const { open, toggle, onPointerEnter, onPointerLeave } = useTooltipChip();
  const name = countryName(country) ?? country;
  return (
    <button
      type="button"
      data-tooltip-chip
      data-who-flag={country}
      aria-label={name}
      onClick={toggle}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className="relative inline-flex h-[12px] w-[18px] shrink-0 cursor-pointer items-center"
    >
      <FlagIcon country={country} className="h-[12px] w-[18px]" />
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-0 z-30 mb-1 max-w-[min(70vw,240px)] whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-center text-[0.7rem] font-medium leading-snug text-foreground shadow-md"
        >
          {name}
        </span>
      )}
    </button>
  );
}

function ShareBar({
  segments,
  color,
  pressedKey,
  onSelect,
  testId,
  showShare,
}: {
  segments: { key: string; label?: string; leftPx: number; widthPx: number; color?: string; pct?: number }[];
  color?: string;
  pressedKey?: string;
  onSelect?: (key: string) => void;
  testId: string;
  showShare?: boolean;
}) {
  const kinds = showShare
    ? inBarKind(
        segments.map((s) => ({
          key: s.key,
          n: 0,
          pct: s.pct ?? 0,
          leftPx: s.leftPx,
          widthPx: s.widthPx,
          fill: s.color ?? color ?? '#404040',
        })),
      )
    : [];
  return (
    <div className="relative h-8 w-full overflow-hidden rounded" data-who-bar={testId}>
      {segments.map((seg, i) => {
        const on = pressedKey === seg.key;
        const base = seg.color ?? color ?? '#404040';
        const fill = pressedKey && !on ? muteColor(base) : base;
        const inset = on ? PRESSED_INSET : 0;
        const kind = kinds[i] ?? 'none';
        const pct = seg.pct ?? 0;
        const label = kind === 'pct' ? `${pct}%` : kind === 'int' ? String(pct) : '';
        const style = {
          top: inset,
          height: `calc(100% - ${inset * 2}px)`,
          left: seg.leftPx + inset,
          width:
            i === segments.length - 1
              ? `calc(100% - ${seg.leftPx + inset * 2}px)`
              : Math.max(0, seg.widthPx - inset * 2),
          backgroundColor: fill,
          color: inkOn(fill),
          boxShadow: !on && i < segments.length - 1 ? 'inset -1px 0 0 #fff' : undefined,
          paddingLeft: label ? '0.375rem' : 0,
          paddingRight: label ? '0.375rem' : 0,
        };
        const body = <span className="truncate">{label}</span>;
        if (!onSelect) {
          return (
            <div
              key={seg.key}
              data-who-seg={seg.key}
              className="absolute box-border flex items-center overflow-hidden text-xs font-bold tabular-nums"
              style={style}
            >
              {body}
            </div>
          );
        }
        return (
          <button
            key={seg.key}
            type="button"
            data-who-region={seg.key}
            data-who-seg={seg.key}
            data-who-pressed={on ? 'true' : 'false'}
            aria-pressed={on}
            aria-label={seg.label ?? seg.key}
            onClick={() => onSelect(seg.key)}
            className="absolute box-border flex cursor-pointer items-center overflow-hidden rounded-sm border-0 text-left text-xs font-bold tabular-nums outline-none focus:outline-none focus-visible:outline-none"
            style={style}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

function OtherRail({
  segment,
  total,
  kind,
}: {
  segment: FitSegment | undefined;
  total: number;
  kind: 'flag' | 'code';
}) {
  const folded = segment?.folded ?? [];
  if (!segment || folded.length === 0) return null;
  return (
    <div className="relative" data-who-other={kind}>
      <div
        aria-hidden
        data-who-leader="rail"
        className="absolute top-0 h-px bg-neutral-400"
        style={{ left: segment.leftPx, right: 0 }}
      />
      <div className="flex flex-wrap justify-end gap-x-2.5 gap-y-1 pt-1">
        {folded.map((item, i) => (
          <span key={item.key} className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums">
            {kind === 'flag' ? <FlagTip country={item.key} /> : <span>{item.key}</span>}
            <span>{formatShare(item.n, total, i === 0)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function markerRow(segments: FitSegment[], render: (seg: FitSegment) => ReactNode) {
  const other = segments.find((seg) => seg.key === OTHER_KEY);
  return (
    <div className="relative mt-1.5 h-[22px] overflow-visible">
      {other && other.folded && other.folded.length > 0 && (
        <div
          aria-hidden
          data-who-leader="stem"
          className="pointer-events-none absolute w-px bg-neutral-400"
          style={{ left: other.leftPx, top: -7, bottom: -1 }}
        />
      )}
      {segments.map((seg) =>
        seg.key === OTHER_KEY ? null : (
          <div key={seg.key} className="absolute top-0 flex h-[22px] items-center" style={{ left: seg.leftPx }}>
            {render(seg)}
          </div>
        ),
      )}
    </div>
  );
}

export function WhoOrigin({
  countries,
  buckets,
  countries7d,
  filter,
  onFilter,
}: {
  countries: Record<string, number>;
  buckets: readonly WhoBucket[];
  countries7d: number;
  filter: WhoFilter | null;
  onFilter: (next: WhoFilter | null) => void;
}) {
  const colRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [barW, setBarW] = useState(0);
  const [widths, setWidths] = useState<Record<string, number>>({});

  useLayoutEffect(() => {
    const el = colRef.current;
    if (!el) return;
    const read = () => setBarW(el.getBoundingClientRect().width);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const platformReady = buckets.length > 0 && buckets.every((b) => typeof b.device === 'string');
  const regionCounts = useMemo(
    () => (platformReady ? mixWho(buckets, 'region', filter) : countries),
    [platformReady, buckets, filter, countries],
  );
  const regions = useMemo(() => regionBar(regionCounts, barW), [regionCounts, barW]);
  const defaultRegion = useMemo(() => {
    const base = platformReady ? mixWho(buckets, 'region', null) : countries;
    const ranked = regionBar(base, 100);
    return ranked[0]?.key ?? null;
  }, [platformReady, buckets, countries]);
  const openRegion: Region | null =
    filter?.dim === 'region' ? (filter.value as Region) : defaultRegion;
  const visible = useMemo(
    () => (platformReady ? visibleBuckets(buckets, filter, defaultRegion) : []),
    [platformReady, buckets, filter, defaultRegion],
  );
  const countryList = useMemo(() => {
    if (platformReady) {
      const counts = new Map<string, number>();
      for (const bucket of visible) {
        if (!bucket.country) continue;
        const key = bucket.country.toUpperCase();
        counts.set(key, (counts.get(key) ?? 0) + bucket.n);
      }
      return [...counts.entries()].map(([key, n]) => ({ key, n }));
    }
    return openRegion ? countryItems(countries, openRegion) : [];
  }, [platformReady, visible, openRegion, countries]);
  const tags = useMemo(
    () => (platformReady ? unshippedTags(visible, null) : openRegion ? unshippedTags(buckets, openRegion) : []),
    [platformReady, visible, buckets, openRegion],
  );
  const overrides = useMemo(
    () =>
      platformReady
        ? languageOverrides(visible, null)
        : openRegion
          ? languageOverrides(buckets, openRegion)
          : [],
    [platformReady, visible, buckets, openRegion],
  );
  const pressedRegion = filter?.dim === 'region' ? filter.value : undefined;
  const pressRegion = (key: string) => {
    if (filter?.dim === 'region' && filter.value === key) onFilter(null);
    else onFilter({ dim: 'region', value: key });
  };

  const measureKey = `${regions.map((r) => r.label).join('|')}\n${tags.map((t) => t.key).join('|')}`;
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const next: Record<string, number> = {};
    const words = measureKey.split('\n').flatMap((line) => (line ? line.split('|') : []));
    for (const word of words) {
      el.textContent = word;
      next[word] = el.getBoundingClientRect().width;
    }
    setWidths((prev) => {
      const keys = Object.keys(next);
      if (keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === next[k])) return prev;
      return next;
    });
  }, [measureKey]);

  const countrySegs = useMemo(
    () => fitBar(countryList, barW, () => FLAG_W),
    [countryList, barW],
  );
  const langSegs = useMemo(
    () => fitBar(tags, barW, (key) => widths[key] ?? key.length * 7.2),
    [tags, barW, widths],
  );
  const nameLabels = useMemo(
    () =>
      layoutNameLabels(
        regions,
        regions.map((r) => widths[r.label] ?? r.label.length * 7.2),
        barW,
      ),
    [regions, widths, barW],
  );
  const countryTotal = countryList.reduce((sum, it) => sum + it.n, 0);
  const tagTotal = tags.reduce((sum, it) => sum + it.n, 0);
  const allTime = distinctCountries(countries);
  const singleRegion = filter?.dim === 'region' || !filter ? openRegion : null;
  const countrySegsPainted = countrySegs.map((seg) => ({
    ...seg,
    color: singleRegion
      ? REGION_COLORS[singleRegion]
      : seg.key === OTHER_KEY
        ? '#737373'
        : (REGION_COLORS[regionOf(seg.key)] ?? '#737373'),
  }));
  const regionTitle = filter && filter.dim !== 'region' ? `Region among ${filter.value}` : 'Region';

  return (
    <TooltipScope>
      <div ref={colRef} className="relative flex min-w-0 flex-col gap-3" data-who-origin>
        <span
          ref={measureRef}
          className="pointer-events-none invisible absolute whitespace-nowrap text-xs font-semibold"
          aria-hidden="true"
        />
        <div data-who-region-module>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <div className={TITLE}>{regionTitle}</div>
            <div className="flex items-baseline gap-1.5 text-xs font-bold" data-who-countries-header>
              <span className={TITLE}>Countries</span>
              <span className="tabular-nums text-foreground">{allTime}</span>
              <span className="tabular-nums text-foreground">
                {countries7d}
                <sub className="ml-px text-[0.65em] font-semibold text-muted-foreground">7d</sub>
              </span>
            </div>
          </div>
          <ShareBar
            testId="region"
            segments={regions}
            pressedKey={pressedRegion}
            onSelect={pressRegion}
            showShare
          />
          <div className="relative mt-1.5 h-[22px] overflow-visible">
            {nameLabels.map((lab) => {
              const region = regions.find((r) => r.key === lab.key);
              if (!region) return null;
              return (
                <button
                  key={lab.key}
                  type="button"
                  data-who-region-label={lab.key}
                  aria-pressed={lab.key === pressedRegion}
                  onClick={() => pressRegion(region.key)}
                  className="absolute top-0 h-[22px] cursor-pointer whitespace-nowrap text-xs font-semibold leading-[22px] outline-none focus:outline-none focus-visible:outline-none"
                  style={{
                    left: lab.leftPx,
                    color: pressedRegion && region.key !== pressedRegion ? muteColor(region.color) : region.color,
                  }}
                >
                  {region.label}
                </button>
              );
            })}
          </div>
        </div>

        <div data-who-countries>
          <ShareBar testId="countries" segments={countrySegsPainted} showShare />
          {markerRow(countrySegs, (seg) => (
            <FlagTip country={seg.key} />
          ))}
          <OtherRail segment={countrySegs.find((s) => s.folded)} total={countryTotal} kind="flag" />
        </div>

        <div data-who-unshipped>
          <div className={cn(TITLE, 'mb-1')}>Unshipped</div>
          {langSegs.length > 0 ? (
            <>
              <ShareBar testId="unshipped" segments={langSegs} color="#404040" />
              {markerRow(langSegs, (seg) => (
                <span data-who-code={seg.key} className="whitespace-nowrap text-xs font-semibold leading-none">
                  {seg.key}
                </span>
              ))}
              <OtherRail segment={langSegs.find((s) => s.folded)} total={tagTotal} kind="code" />
            </>
          ) : (
            <div className="h-8 w-full rounded bg-neutral-100" data-who-bar="unshipped" />
          )}
        </div>

        <div data-who-overrides>
          <div className={cn(TITLE, 'mb-1')}>Overrides</div>
          {overrides.length === 0 ? (
            <p className="text-xs text-muted-foreground">No language overrides in this window.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {overrides.map((row) => (
                <div
                  key={`${row.lang}\t${row.switched}\t${row.country}`}
                  className="flex items-center gap-2 text-xs font-semibold"
                  data-who-override={`${row.lang}-${row.switched}`}
                >
                  <span className="tabular-nums">
                    {row.lang} → {row.switched}
                  </span>
                  <span className="tabular-nums">{row.n}</span>
                  {row.country ? <FlagTip country={row.country} /> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </TooltipScope>
  );
}
