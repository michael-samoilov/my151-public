import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DeviceIcon, OsIcon, BrowserIcon, TooltipScope, useTooltipChip } from '@/components/admin/platformIcons';
import { cn } from '@/lib/utils';
import {
  ICON_PX,
  dimTitle,
  clampChipLabel,
  inBarKind,
  inkOn,
  layoutLabels,
  mixCounts,
  sliceFill,
  sliceGeometry,
  type LabelLayout,
  type PlatformClamp,
  type PlatformDim,
  type PlatformJoint,
} from '@/lib/platformStacks';
import { mixWho, type WhoBucket, type WhoFilter } from '@/lib/whoOrigin';

function Mark({ dim, value }: { dim: PlatformDim; value: string }) {
  if (dim === 'device') return <DeviceIcon value={value} />;
  if (dim === 'os') return <OsIcon value={value} />;
  return <BrowserIcon value={value} />;
}

function measureFactory(el: HTMLSpanElement | null): (word: string) => number {
  return (word: string) => {
    if (!el) return word.length * 7.2;
    el.textContent = word;
    return el.getBoundingClientRect().width;
  };
}

function LogoLabel({
  lab,
  dim,
  barW,
  canClamp,
  onToggle,
}: {
  lab: LabelLayout;
  dim: PlatformDim;
  barW: number;
  canClamp: boolean;
  onToggle: (value: string) => void;
}) {
  const { open, toggle, onPointerEnter, onPointerLeave } = useTooltipChip();
  const edge =
    lab.align === 'end' || (barW > 0 && lab.leftPx > barW * 0.67)
      ? 'end'
      : lab.leftPx < 40
        ? 'start'
        : 'center';
  return (
    <button
      type="button"
      data-tooltip-chip
      onClick={() => {
        toggle();
        if (canClamp) onToggle(lab.key);
      }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className="absolute top-0 flex h-[15px] cursor-pointer items-center gap-1 whitespace-nowrap text-xs font-semibold"
      style={{
        left: lab.align === 'end' ? undefined : lab.leftPx,
        right: lab.align === 'end' ? 0 : undefined,
        color: lab.color,
      }}
      aria-label={lab.key}
    >
      <span className="inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center" style={{ width: ICON_PX, height: ICON_PX }}>
        <Mark dim={dim} value={lab.key} />
      </span>
      {lab.showWord && (
        <span className="inline-flex h-[15px] items-center leading-none" style={{ transform: 'translateY(1px)' }}>
          {lab.key}
        </span>
      )}
      {open && (
        <span
          role="tooltip"
          data-who-logo-tip
          className={cn(
            'absolute bottom-full z-30 mb-1 max-w-[min(70vw,240px)] whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-center text-[0.7rem] font-medium leading-snug text-foreground shadow-md',
            edge === 'end' && 'right-0',
            edge === 'start' && 'left-0',
            edge === 'center' && 'left-1/2 -translate-x-1/2',
          )}
        >
          {lab.key}
        </span>
      )}
    </button>
  );
}

const PRESSED_INSET = 3;

function StackBar({
  dim,
  counts,
  filter,
  canClamp,
  onToggle,
}: {
  dim: PlatformDim;
  counts: Record<string, number>;
  filter: WhoFilter | null;
  canClamp: boolean;
  onToggle: (value: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [barW, setBarW] = useState(0);

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const read = () => setBarW(el.getBoundingClientRect().width);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const slices = useMemo(() => sliceGeometry(counts, dim, barW), [counts, dim, barW]);
  const kinds = useMemo(() => inBarKind(slices), [slices]);
  const [labels, setLabels] = useState(() => layoutLabels(slices, barW, () => 0));

  useLayoutEffect(() => {
    setLabels(layoutLabels(slices, barW, measureFactory(measureRef.current)));
  }, [slices, barW]);
  const driving = filter?.dim === dim;
  const fillClamp: PlatformClamp | null = driving ? { dim, value: filter.value } : null;

  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {dimTitle(dim, filter)}
      </div>
      <div
        ref={trackRef}
        className="relative h-8 w-full overflow-hidden rounded"
        data-who-stack={dim}
      >
        {slices.map((s, i) => {
          const on = driving && filter?.value === s.key;
          const fill = sliceFill(s.key, dim, fillClamp);
          const kind = kinds[i];
          const label =
            kind === 'pct' ? `${s.pct}%` : kind === 'int' ? String(s.pct) : '';
          const inset = on ? PRESSED_INSET : 0;
          const width =
            i === slices.length - 1
              ? `calc(100% - ${s.leftPx + inset * 2}px)`
              : Math.max(0, s.widthPx - inset * 2);
          return (
            <button
              key={s.key}
              type="button"
              disabled={!canClamp}
              aria-pressed={on}
              data-who-pressed={on ? 'true' : 'false'}
              aria-label={`${s.key} ${s.pct}%`}
              onClick={() => canClamp && onToggle(s.key)}
              className="absolute box-border flex min-w-0 cursor-pointer items-center overflow-hidden rounded-sm border-0 text-left text-xs font-bold tabular-nums outline-none transition-[top,left,width,height,background-color] duration-300 focus:outline-none focus-visible:outline-none disabled:cursor-default disabled:opacity-100"
              style={{
                top: inset,
                height: `calc(100% - ${inset * 2}px)`,
                left: s.leftPx + inset,
                width,
                maxWidth: `calc(100% - ${s.leftPx + inset}px)`,
                paddingLeft: kind === 'none' ? 0 : '0.375rem',
                paddingRight: kind === 'none' ? 0 : '0.375rem',
                backgroundColor: fill,
                color: inkOn(fill),
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="relative mt-1.5 h-[22px] overflow-visible">
        <span
          ref={measureRef}
          className="pointer-events-none invisible absolute whitespace-nowrap text-xs font-semibold"
          aria-hidden="true"
        />
        {labels.map((lab) => (
          <LogoLabel
            key={lab.key}
            lab={lab}
            dim={dim}
            barW={barW}
            canClamp={canClamp}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}

function bucketsHavePlatform(buckets: readonly WhoBucket[] | undefined): buckets is readonly WhoBucket[] {
  return !!buckets?.length && buckets.every((b) => typeof b.device === 'string');
}

export function PlatformStacks({
  devices,
  os,
  browsers,
  joints,
  buckets,
  filter,
  onFilter,
}: {
  devices: Record<string, number>;
  os: Record<string, number>;
  browsers: Record<string, number>;
  joints?: PlatformJoint[];
  buckets?: readonly WhoBucket[];
  filter: WhoFilter | null;
  onFilter: (next: WhoFilter | null) => void;
}) {
  const fromBuckets = bucketsHavePlatform(buckets);
  const platformClamp: PlatformClamp | null =
    filter && filter.dim !== 'region' ? { dim: filter.dim, value: filter.value } : null;
  const canClamp = fromBuckets || (joints?.length ?? 0) > 0;
  const deviceCounts = fromBuckets
    ? mixWho(buckets, 'device', filter)
    : joints?.length
      ? mixCounts(joints, 'device', platformClamp)
      : devices;
  const osCounts = fromBuckets
    ? mixWho(buckets, 'os', filter)
    : joints?.length
      ? mixCounts(joints, 'os', platformClamp)
      : os;
  const browserCounts = fromBuckets
    ? mixWho(buckets, 'browser', filter)
    : joints?.length
      ? mixCounts(joints, 'browser', platformClamp)
      : browsers;

  const toggle = (dim: PlatformDim, value: string) => {
    if (!canClamp) return;
    if (filter && filter.dim === dim && filter.value === value) onFilter(null);
    else onFilter({ dim, value });
  };

  return (
    <TooltipScope>
      <div className="flex min-w-0 flex-col gap-3" data-who-platform>
        <StackBar dim="device" counts={deviceCounts} filter={filter} canClamp={canClamp} onToggle={(v) => toggle('device', v)} />
        <StackBar dim="os" counts={osCounts} filter={filter} canClamp={canClamp} onToggle={(v) => toggle('os', v)} />
        <StackBar dim="browser" counts={browserCounts} filter={filter} canClamp={canClamp} onToggle={(v) => toggle('browser', v)} />
      </div>
    </TooltipScope>
  );
}

export function ClampChip({
  clamp,
  onClear,
}: {
  clamp: WhoFilter;
  onClear: () => void;
}): ReactNode {
  const label = clampChipLabel(clamp);
  return (
    <button
      type="button"
      onClick={onClear}
      className="rounded-full border border-foreground bg-foreground px-2.5 py-1 text-[0.7rem] font-semibold text-card"
      aria-label={`Clear ${label} clamp`}
      data-who-clamp
    >
      {label} ×
    </button>
  );
}
