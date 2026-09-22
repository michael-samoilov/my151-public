import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { FlagIcon, TooltipScope, useTooltipChip } from '@/components/admin/platformIcons';
import { countryName, langName } from '@/components/admin/userPreview';
import type { WhoBucket } from '../../../api/_aggregate';
import { REGION_COLORS, regionOf, type Region } from '@/lib/countryRegions';
import { inBarKind, inkOn, muteColor, shadeRamp } from '@/lib/platformStacks';
import { cn } from '@/lib/utils';
import {
  FLAG_W,
  MARKER_GAP,
  OTHER_KEY,
  amongTitle,
  balanceRailRows,
  captionKind,
  countryItems,
  countryHeaderCounts,
  countryOtherLabeled,
  countryRooms,
  fitBar,
  formatShare,
  LANGUAGE_SHARE_LABEL,
  languageOverrides,
  languageShare,
  layoutNameLabels,
  proportionBar,
  primaryLanguageRegion,
  countryCounts,
  regionBar,
  unshippedTags,
  visibleBuckets,
  type FitItem,
  type FitSegment,
  type WhoFilter,
} from '@/lib/whoOrigin';

const TITLE = 'text-xs font-bold uppercase tracking-wide text-muted-foreground';
const PRESSED_INSET = 3;
const SEGMENT_MOTION = 'transition-[top,left,width,height,background-color] duration-300';

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
        let kind = kinds[i] ?? 'none';
        const pct = seg.pct ?? 0;
        if (kind === 'none' && pct > 0 && pct < 10 && seg.widthPx >= 12) kind = 'int';
        const label = kind === 'pct' ? `${pct}%` : kind === 'int' ? String(pct) : '';
        const tight = kind === 'int' && seg.widthPx < 28;
        const style = {
          top: inset,
          height: `calc(100% - ${inset * 2}px)`,
          left: seg.leftPx,
          width: i === segments.length - 1 ? `calc(100% - ${seg.leftPx}px)` : seg.widthPx,
          backgroundColor: fill,
          color: inkOn(fill),
          boxShadow: !on && i < segments.length - 1 ? 'inset -1px 0 0 #fff' : undefined,
          justifyContent: tight ? 'center' : 'flex-start',
          paddingLeft: !label || tight ? (label ? 1 : 0) : '0.375rem',
          paddingRight: !label || tight ? (label ? 1 : 0) : '0.375rem',
        };
        const body = <span className="truncate">{label}</span>;
        if (!onSelect) {
          return (
            <div
              key={seg.key}
              data-who-seg={seg.key}
              className={cn(
                'absolute box-border flex items-center overflow-hidden text-xs font-bold tabular-nums',
                SEGMENT_MOTION,
              )}
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
            className={cn(
              'absolute box-border flex cursor-pointer items-center overflow-hidden rounded-sm border-0 text-left text-xs font-bold tabular-nums outline-none focus:outline-none focus-visible:outline-none',
              SEGMENT_MOTION,
            )}
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
  textFor,
}: {
  segment: FitSegment | undefined;
  total: number;
  kind: 'flag' | 'lang';
  textFor?: (key: string) => string;
}) {
  const folded = segment?.folded ?? [];
  const hostRef = useRef<HTMLDivElement>(null);
  const [span, setSpan] = useState<{ left: number; width: number } | null>(null);
  const [metrics, setMetrics] = useState<{ widths: number[]; gap: number; container: number } | null>(null);
  const labelKey = folded.map((item) => item.key).join('|');
  const fitted = metrics && metrics.widths.length === folded.length ? metrics : null;
  const rows = fitted
    ? balanceRailRows(fitted.widths, fitted.gap, fitted.container)
    : [folded.map((_, index) => index)];
  const rowKey = rows.map((row) => row.length).join('.');

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const read = () => {
      const topRow = host.querySelector('[data-who-rail-row]');
      const labels = [...host.querySelectorAll<HTMLElement>('[data-who-rail-label]')];
      const topLabels = [...(topRow?.querySelectorAll<HTMLElement>('[data-who-rail-label]') ?? [])];
      const gap = topRow ? Number.parseFloat(getComputedStyle(topRow).columnGap) || 0 : 0;
      const widths = labels.map((el) => el.getBoundingClientRect().width);
      const container = host.clientWidth;
      setMetrics((prev) =>
        prev &&
        prev.gap === gap &&
        prev.container === container &&
        prev.widths.length === widths.length &&
        prev.widths.every((width, i) => width === widths[i])
          ? prev
          : { widths, gap, container },
      );
      if (topLabels.length === 0) {
        setSpan(null);
        return;
      }
      const origin = host.getBoundingClientRect().left;
      const left = Math.min(...topLabels.map((el) => el.getBoundingClientRect().left)) - origin;
      const right = Math.max(...topLabels.map((el) => el.getBoundingClientRect().right)) - origin;
      const next = { left, width: Math.max(0, right - left) };
      setSpan((prev) => (prev && prev.left === next.left && prev.width === next.width ? prev : next));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(host);
    return () => ro.disconnect();
  }, [labelKey, rowKey]);

  if (!segment || folded.length === 0) return null;
  return (
    <div className="relative min-w-0" data-who-other={kind}>
      {span && (
        <div
          aria-hidden
          data-who-leader="rail"
          className="absolute top-0 h-px bg-neutral-400"
          style={{ left: span.left, width: span.width }}
        />
      )}
      <div ref={hostRef} className="flex w-full min-w-0 flex-col gap-y-1 pt-1">
        {rows.map((row) => (
          <div key={row.join('-')} data-who-rail-row className="flex w-full min-w-0 justify-end gap-x-2.5">
            {row.map((index) => {
              const item: FitItem = folded[index];
              return (
                <span
                  key={item.key}
                  data-who-rail-label
                  className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold tabular-nums"
                >
                  {kind === 'flag' ? <FlagTip country={item.key} /> : <span>{textFor?.(item.key) ?? item.key}</span>}
                  <span>{formatShare(item.n, total, index === 0)}</span>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function markerRow(segments: FitSegment[], render: (seg: FitSegment) => ReactNode, showOther = true) {
  const other = segments.find((seg) => seg.key === OTHER_KEY);
  return (
    <div className="relative mt-1.5 h-[22px] overflow-visible">
      {showOther && other && other.folded && other.folded.length > 0 && (
        <div
          aria-hidden
          data-who-leader="stem"
          className="pointer-events-none absolute w-px bg-neutral-400"
          style={{ left: other.leftPx + Math.max(0, other.widthPx - 6), top: -7, bottom: -1 }}
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
  const [langOpen, setLangOpen] = useState(false);
  const langPanelId = useId();

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
    () => (platformReady ? countryCounts(buckets, filter) : countries),
    [platformReady, buckets, filter, countries],
  );
  const regions = useMemo(() => regionBar(regionCounts, barW), [regionCounts, barW]);
  const openRegion: Region | null = filter?.dim === 'region' ? (filter.value as Region) : null;
  const visible = useMemo(
    () => (platformReady ? visibleBuckets(buckets, filter, null) : []),
    [platformReady, buckets, filter],
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
    return countryItems(countries, openRegion);
  }, [platformReady, visible, openRegion, countries]);
  const tags = useMemo(
    () => (platformReady ? unshippedTags(visible, null) : unshippedTags(buckets, openRegion)),
    [platformReady, visible, buckets, openRegion],
  );
  const overrides = useMemo(
    () => (platformReady ? languageOverrides(visible, null) : languageOverrides(buckets, openRegion)),
    [platformReady, visible, buckets, openRegion],
  );
  const pressedRegion = filter?.dim === 'region' ? filter.value : undefined;
  const pressRegion = (key: string) => {
    if (filter?.dim === 'region' && filter.value === key) onFilter(null);
    else onFilter({ dim: 'region', value: key });
  };

  const measureWords = useMemo(() => {
    const words = new Set<string>();
    for (const region of regions) words.add(region.label);
    for (const item of countryList) {
      words.add(item.key);
      const name = countryName(item.key);
      if (name) words.add(name);
    }
    for (const item of tags) {
      words.add(item.key);
      const name = langName(item.key);
      if (name) words.add(name);
    }
    for (const name of Object.values(LANGUAGE_SHARE_LABEL)) words.add(name);
    return [...words];
  }, [regions, countryList, tags]);
  const measureKey = measureWords.join('\n');
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const next: Record<string, number> = {};
    for (const word of measureWords) {
      el.textContent = word;
      next[word] = el.getBoundingClientRect().width;
    }
    setWidths((prev) => {
      const keys = Object.keys(next);
      if (keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === next[k])) return prev;
      return next;
    });
  }, [measureKey, measureWords]);

  const countrySegs = useMemo(
    () => fitBar(countryList, barW, () => FLAG_W),
    [countryList, barW],
  );
  const labelCountryOther = countryOtherLabeled(filter);
  const rooms = useMemo(
    () => countryRooms(countrySegs, barW, labelCountryOther),
    [countrySegs, barW, labelCountryOther],
  );
  const shareItems = useMemo(
    () => (platformReady ? languageShare(visible, null) : languageShare(buckets, openRegion)),
    [platformReady, visible, buckets, openRegion],
  );
  const shareSegs = useMemo(() => proportionBar(shareItems, barW), [shareItems, barW]);
  const sharePainted = useMemo(
    () =>
      shareSegs.map((seg) => ({
        ...seg,
        label:
          seg.key === 'served' || seg.key === 'unshipped' || seg.key === 'overrides'
            ? LANGUAGE_SHARE_LABEL[seg.key]
            : seg.key,
        color: seg.key === 'unshipped' ? '#FF8000' : seg.key === 'overrides' ? '#E62829' : '#404040',
      })),
    [shareSegs],
  );
  const shareLabels = useMemo(
    () =>
      layoutNameLabels(
        sharePainted,
        sharePainted.map((seg) => widths[seg.label ?? ''] ?? (seg.label?.length ?? 1) * 7.2),
        barW,
      ),
    [sharePainted, widths, barW],
  );
  const langSegs = useMemo(
    () =>
      fitBar(tags, barW, (key) => {
        const name = langName(key) ?? key;
        return widths[name] ?? name.length * 7.2;
      }),
    [tags, barW, widths],
  );
  const langColor = useMemo(() => {
    const map = new Map<string, string>();
    for (const tag of tags) map.set(tag.key, REGION_COLORS[primaryLanguageRegion(visible, tag.key)]);
    return map;
  }, [tags, visible]);
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
  const headerCounts = useMemo(
    () =>
      platformReady
        ? countryHeaderCounts(buckets, filter, null)
        : { all: countryList.length, week: countries7d },
    [platformReady, buckets, filter, countryList.length, countries7d],
  );
  const singleRegion: Region | null = filter?.dim === 'region' ? (filter.value as Region) : null;
  const countrySegsPainted = useMemo(() => {
    const base = countrySegs.map((seg) => ({
      ...seg,
      color: singleRegion
        ? REGION_COLORS[singleRegion]
        : seg.key === OTHER_KEY
          ? '#737373'
          : (REGION_COLORS[regionOf(seg.key)] ?? '#737373'),
    }));
    const colors = shadeRamp(base.map((seg) => seg.color));
    return base.map((seg, i) => ({ ...seg, color: colors[i] }));
  }, [countrySegs, singleRegion]);
  const langPainted = useMemo(() => {
    const base = langSegs.map((seg) =>
      seg.key === OTHER_KEY ? '#737373' : (langColor.get(seg.key) ?? '#404040'),
    );
    const colors = shadeRamp(base);
    return langSegs.map((seg, i) => ({ ...seg, color: colors[i] }));
  }, [langSegs, langColor]);
  const regionTitle = amongTitle('Region', filter, 'region');

  return (
    <TooltipScope>
      <div ref={colRef} className="relative flex min-w-0 flex-col gap-3" data-who-origin>
        <span
          ref={measureRef}
          className="pointer-events-none invisible absolute whitespace-nowrap text-xs font-semibold"
          aria-hidden="true"
        />
        <div data-who-region-module>
          <div className={cn(TITLE, 'mb-1')}>{regionTitle}</div>
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

        <div className="min-w-0" data-who-countries>
          <div className="mb-1 flex items-baseline gap-1.5 text-xs font-bold" data-who-countries-header>
            <span className={TITLE}>{amongTitle('Countries', filter)}</span>
            <span className="tabular-nums text-foreground">{headerCounts.all}</span>
            <span className="tabular-nums text-foreground">
              {headerCounts.week}
              <sub className="ml-px text-[0.65em] font-semibold text-muted-foreground">7d</sub>
            </span>
          </div>
          <ShareBar testId="countries" segments={countrySegsPainted} showShare />
          {markerRow(countrySegs, (seg) => {
            const name = countryName(seg.key) ?? seg.key;
            const kind = captionKind(
              widths[name] ?? name.length * 7.2,
              widths[seg.key] ?? seg.key.length * 7.2,
              rooms[seg.key] ?? 0,
            );
            const text = kind === 'full' ? name : kind === 'short' ? seg.key : null;
            return (
              <span
                className="inline-flex items-center whitespace-nowrap"
                style={{ gap: text ? MARKER_GAP : 0 }}
                data-who-country={seg.key}
              >
                <FlagTip country={seg.key} />
                {text ? (
                  <span data-who-country-label={seg.key} className="text-xs font-semibold leading-none">
                    {text}
                  </span>
                ) : null}
              </span>
            );
          }, labelCountryOther)}
          {labelCountryOther ? (
            <OtherRail segment={countrySegs.find((s) => s.folded)} total={countryTotal} kind="flag" />
          ) : null}
        </div>

        <div className="min-w-0" data-who-languages data-who-languages-open={langOpen ? 'true' : 'false'}>
          <button
            type="button"
            className="mb-1 flex w-full cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left outline-none"
            aria-expanded={langOpen}
            aria-controls={langPanelId}
            data-who-languages-toggle
            onClick={() => setLangOpen((open) => !open)}
          >
            <span className={TITLE}>{amongTitle('Languages', filter)}</span>
            <ChevronDown
              aria-hidden
              className={cn('h-3 w-3 shrink-0 text-muted-foreground transition-transform', langOpen && 'rotate-180')}
            />
          </button>
          {sharePainted.length > 0 ? (
            <>
              <ShareBar testId="languages" segments={sharePainted} showShare />
              <div className="relative mt-1.5 h-[22px] overflow-visible">
                {shareLabels.map((lab) => {
                  const seg = sharePainted.find((item) => item.key === lab.key);
                  if (!seg?.label) return null;
                  return (
                    <span
                      key={lab.key}
                      data-who-share-label={lab.key}
                      className="absolute top-0 h-[22px] whitespace-nowrap text-xs font-semibold leading-[22px]"
                      style={{ left: lab.leftPx, color: seg.color }}
                    >
                      {seg.label}
                    </span>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="h-8 w-full rounded bg-neutral-100" data-who-bar="languages" />
          )}
          <div id={langPanelId} className={langOpen ? 'mt-3 flex min-w-0 flex-col gap-3' : undefined}>
            {langOpen ? (
            <>
              <div className="min-w-0" data-who-unshipped>
                <div className={cn(TITLE, 'mb-1')}>Unshipped</div>
                {langSegs.length > 0 ? (
                  <>
                    <ShareBar testId="unshipped" segments={langPainted} showShare />
                    {markerRow(langSegs, (seg) => {
                      const name = langName(seg.key) ?? seg.key;
                      const paint = langPainted.find((item) => item.key === seg.key);
                      return (
                        <span
                          data-who-code={seg.key}
                          data-who-lang-label="name"
                          className="whitespace-nowrap text-xs font-semibold leading-none"
                          style={{ color: paint?.color ?? langColor.get(seg.key) ?? '#404040' }}
                        >
                          {name}
                        </span>
                      );
                    })}
                    <OtherRail
                      segment={langSegs.find((s) => s.folded)}
                      total={tagTotal}
                      kind="lang"
                      textFor={(key) => langName(key) ?? key}
                    />
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
            </>
            ) : null}
          </div>
        </div>
      </div>
    </TooltipScope>
  );
}
