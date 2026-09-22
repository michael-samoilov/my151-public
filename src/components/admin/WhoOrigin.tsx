import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlagIcon, TooltipScope, useTooltipChip } from '@/components/admin/platformIcons';
import { countryName } from '@/components/admin/userPreview';
import type { WhoBucket } from '../../../api/_aggregate';
import type { Region } from '@/lib/countryRegions';
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
  regionBar,
  unshippedTags,
  type FitSegment,
} from '@/lib/whoOrigin';

const RING = 'inset 0 0 0 2px #fff, inset 0 0 0 4px #0a0a0a';
const TITLE = 'text-xs font-bold uppercase tracking-wide text-muted-foreground';

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
  selectedKey,
  onSelect,
  testId,
}: {
  segments: { key: string; label?: string; leftPx: number; widthPx: number; color?: string }[];
  color?: string;
  selectedKey?: string;
  onSelect?: (key: string) => void;
  testId: string;
}) {
  return (
    <div className="relative h-8 w-full overflow-hidden rounded" data-who-bar={testId}>
      {segments.map((seg, i) => {
        const fill = seg.color ?? color ?? '#404040';
        const on = selectedKey === seg.key;
        const shadows = [
          on ? RING : '',
          i < segments.length - 1 ? 'inset -1px 0 0 #fff' : '',
        ].filter(Boolean);
        const style = {
          left: seg.leftPx,
          width: i === segments.length - 1 ? `calc(100% - ${seg.leftPx}px)` : Math.max(0, seg.widthPx),
          backgroundColor: fill,
          boxShadow: shadows.join(', ') || undefined,
        };
        if (!onSelect) {
          return <div key={seg.key} className="absolute top-0 h-full" style={style} />;
        }
        return (
          <button
            key={seg.key}
            type="button"
            data-who-region={seg.key}
            aria-pressed={on}
            aria-label={seg.label ?? seg.key}
            onClick={() => onSelect(seg.key)}
            className="absolute top-0 h-full cursor-pointer border-0 p-0"
            style={style}
          />
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
    <div className="relative mt-1" data-who-other={kind}>
      <div
        aria-hidden
        className="absolute top-0 h-px bg-neutral-400"
        style={{ left: segment.leftPx, right: 0 }}
      />
      <div className="flex flex-wrap justify-end gap-x-2.5 gap-y-1 pt-1.5">
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
  return (
    <div className="relative mt-1.5 h-[22px] overflow-visible">
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
}: {
  countries: Record<string, number>;
  buckets: readonly WhoBucket[];
  countries7d: number;
}) {
  const colRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [barW, setBarW] = useState(0);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Region | null>(null);

  useLayoutEffect(() => {
    const el = colRef.current;
    if (!el) return;
    const read = () => setBarW(el.getBoundingClientRect().width);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const regions = useMemo(() => regionBar(countries, barW), [countries, barW]);
  const active = regions.some((r) => r.key === selected) ? selected : (regions[0]?.key ?? null);
  const countryList = useMemo(
    () => (active ? countryItems(countries, active) : []),
    [countries, active],
  );
  const tags = useMemo(() => (active ? unshippedTags(buckets, active) : []), [buckets, active]);
  const overrides = useMemo(
    () => (active ? languageOverrides(buckets, active) : []),
    [buckets, active],
  );

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
  const regionColor = regions.find((r) => r.key === active)?.color;

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
            <div className={TITLE}>Region</div>
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
            selectedKey={active ?? undefined}
            onSelect={(key) => setSelected(key as Region)}
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
                  aria-pressed={lab.key === active}
                  onClick={() => setSelected(region.key)}
                  className="absolute top-0 h-[22px] cursor-pointer whitespace-nowrap text-xs font-semibold leading-[22px]"
                  style={{ left: lab.leftPx, color: region.color }}
                >
                  {region.label}
                </button>
              );
            })}
          </div>
        </div>

        <div data-who-countries>
          <ShareBar testId="countries" segments={countrySegs} color={regionColor} />
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
