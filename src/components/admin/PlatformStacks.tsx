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

function StackBar({
  dim,
  counts,
  clamp,
  canClamp,
  onToggle,
}: {
  dim: PlatformDim;
  counts: Record<string, number>;
  clamp: PlatformClamp | null;
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
  const driving = clamp?.dim === dim;

  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {dimTitle(dim, clamp)}
      </div>
      <div
        ref={trackRef}
        className="relative h-8 w-full overflow-hidden rounded"
        data-who-stack={dim}
      >
        {slices.map((s, i) => {
          const on = driving && clamp?.value === s.key;
          const fill = sliceFill(s.key, dim, clamp);
          const kind = kinds[i];
          const label =
            kind === 'pct' ? `${s.pct}%` : kind === 'int' ? String(s.pct) : '';
          return (
            <button
              key={s.key}
              type="button"
              disabled={!canClamp}
              aria-pressed={on}
              aria-label={`${s.key} ${s.pct}%`}
              onClick={() => canClamp && onToggle(s.key)}
              className="absolute top-0 box-border flex h-full min-w-0 cursor-pointer items-center overflow-hidden rounded-sm border-0 text-left text-xs font-bold tabular-nums transition-[left,width,background-color] duration-300 disabled:cursor-default disabled:opacity-100"
              style={{
                left: s.leftPx,
                width:
                  i === slices.length - 1
                    ? `calc(100% - ${s.leftPx}px)`
                    : Math.max(0, s.widthPx),
                maxWidth: `calc(100% - ${s.leftPx}px)`,
                paddingLeft: kind === 'none' ? 0 : '0.375rem',
                paddingRight: kind === 'none' ? 0 : '0.375rem',
                backgroundColor: fill,
                color: inkOn(fill),
                boxShadow: on ? 'inset 0 0 0 2px #fff, inset 0 0 0 4px #0a0a0a' : undefined,
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

export function PlatformStacks({
  devices,
  os,
  browsers,
  joints,
  clamp,
  onClamp,
}: {
  devices: Record<string, number>;
  os: Record<string, number>;
  browsers: Record<string, number>;
  joints?: PlatformJoint[];
  clamp: PlatformClamp | null;
  onClamp: (next: PlatformClamp | null) => void;
}) {
  const canClamp = (joints?.length ?? 0) > 0;
  const deviceCounts = joints?.length ? mixCounts(joints, 'device', clamp) : devices;
  const osCounts = joints?.length ? mixCounts(joints, 'os', clamp) : os;
  const browserCounts = joints?.length ? mixCounts(joints, 'browser', clamp) : browsers;

  const toggle = (dim: PlatformDim, value: string) => {
    if (!canClamp) return;
    if (clamp && clamp.dim === dim && clamp.value === value) onClamp(null);
    else onClamp({ dim, value });
  };

  return (
    <TooltipScope>
      <div className="flex min-w-0 flex-col gap-3" data-who-platform>
        <StackBar dim="device" counts={deviceCounts} clamp={clamp} canClamp={canClamp} onToggle={(v) => toggle('device', v)} />
        <StackBar dim="os" counts={osCounts} clamp={clamp} canClamp={canClamp} onToggle={(v) => toggle('os', v)} />
        <StackBar dim="browser" counts={browserCounts} clamp={clamp} canClamp={canClamp} onToggle={(v) => toggle('browser', v)} />
      </div>
    </TooltipScope>
  );
}

export function ClampChip({
  clamp,
  onClear,
}: {
  clamp: PlatformClamp;
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
