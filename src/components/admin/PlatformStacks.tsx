import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DeviceIcon, OsIcon, BrowserIcon } from '@/components/admin/platformIcons';
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
      <div className="relative mt-1.5 h-[22px]">
        <span
          ref={measureRef}
          className="pointer-events-none invisible absolute whitespace-nowrap text-xs font-semibold"
          aria-hidden="true"
        />
        {labels.map((lab) => (
          <button
            key={lab.key}
            type="button"
            disabled={!canClamp}
            onClick={() => canClamp && onToggle(lab.key)}
            className="absolute top-0 flex h-[15px] cursor-pointer items-center gap-1 whitespace-nowrap text-xs font-semibold disabled:cursor-default disabled:opacity-100"
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
          </button>
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
    <div className="flex min-w-0 flex-col gap-3" data-who-platform>
      <StackBar dim="device" counts={deviceCounts} clamp={clamp} canClamp={canClamp} onToggle={(v) => toggle('device', v)} />
      <StackBar dim="os" counts={osCounts} clamp={clamp} canClamp={canClamp} onToggle={(v) => toggle('os', v)} />
      <StackBar dim="browser" counts={browserCounts} clamp={clamp} canClamp={canClamp} onToggle={(v) => toggle('browser', v)} />
    </div>
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
