import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  fmtDay,
  formatSessionMeta,
  midnightBoundaries,
  showDayLines,
  weekBoundaries,
  type TimelinePoint,
} from './sessionTimelineMath';
import { applySessionChip } from './sessionChip';
import { milestoneFill, placeMilestones, type ChartMilestone } from './sessionMilestones';

export type { TimelinePoint };
export type { ChartMilestone };

/** Native range thumb size. Dot centers use half of this so they sit under the thumb. */
const SCRUB_THUMB_PX = 22;
const CHART_PAD_L = 6;
const CHART_PAD_R = 6;

const EV_LABEL: Record<string, string> = {
  'intro-shown': 'intro',
  'intro-cta': 'start',
  'milestone-25': '25',
  'milestone-100': '100',
  'milestone-151': '151',
  'view-visit': 'view',
};

/**
 * Bespoke session-history diff timeline. Each session is placed by timestamp (so
 * spacing is elapsed time) and shows its insertions up in green and deletions
 * down in red — never netted, so a session that swapped members reads as both. A
 * line tracks the running size on the same axis. Subtle verticals mark each
 * midnight; stronger ones mark Saturday→Sunday. Event dots ride a rail on top;
 * a red playhead marks the scrubbed session; the slider scrubs and the readout
 * states the count, date, duration, and the diff on one line.
 */
export function SessionTimeline({
  points,
  index,
  onIndex,
  countUnit,
  deltaUnit = '',
  peakLabel,
  extra,
  leftChip,
  rightChip,
  milestones = [],
  tz,
  children,
}: {
  points: TimelinePoint[];
  index: number;
  onIndex: (i: number) => void;
  countUnit: string;
  deltaUnit?: string;
  peakLabel?: string;
  extra?: string;
  leftChip?: ReactNode;
  rightChip?: ReactNode;
  milestones?: ChartMilestone[];
  tz?: string;
  /** Snapshot under the chart. On a phone the scrubber docks flush with the
   *  bottom nav. Desktop keeps the slider under the chart. */
  children?: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(320);
  // Playhead follows the finger immediately. Snapshot `index` is a React
  // transition, so a heavy dex/league child cannot stall the thumb.
  const [playhead, setPlayhead] = useState(index);
  const playheadRef = useRef(index);
  const dragging = useRef(false);
  const snapRaf = useRef(0);
  const lineRef = useRef<SVGLineElement>(null);
  const countRef = useRef<HTMLElement>(null);
  const dateRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pointsRef = useRef(points);
  const wRef = useRef(W);
  const tzRef = useRef(tz);
  const countUnitRef = useRef(countUnit);
  const deltaUnitRef = useRef(deltaUnit);
  const applyPlayhead = useCallback((next: number) => {
    const pts = pointsRef.current;
    const p = pts[next];
    if (!p) return;
    const width = wRef.current;
    const t0 = pts[0]?.t ?? 0;
    const t1 = pts[pts.length - 1]?.t ?? t0;
    const span = t1 - t0 || 1;
    const px = (CHART_PAD_L + (width - CHART_PAD_L - CHART_PAD_R) * ((p.t - t0) / span)).toFixed(1);
    const line = document.querySelector('[data-testid="session-playhead-line"]');
    if (line) {
      line.setAttribute('x1', px);
      line.setAttribute('x2', px);
    }
    applySessionChip(document, p, {
      tz: tzRef.current,
      countUnit: countUnitRef.current,
      deltaUnit: deltaUnitRef.current,
    });
  }, []);
  useLayoutEffect(() => {
    pointsRef.current = points;
    wRef.current = W;
    tzRef.current = tz;
    countUnitRef.current = countUnit;
    deltaUnitRef.current = deltaUnit;
    applyPlayhead(playheadRef.current);
  });
  useLayoutEffect(() => {
    const syncFromInput = () => {
      const el = document.querySelector('input[aria-label="Scrub sessions"]');
      if (!(el instanceof HTMLInputElement)) return;
      const next = Number(el.value);
      if (!Number.isFinite(next)) return;
      playheadRef.current = next;
      applyPlayhead(next);
    };
    document.addEventListener('input', syncFromInput, true);
    document.addEventListener('pointermove', syncFromInput, true);
    return () => {
      document.removeEventListener('input', syncFromInput, true);
      document.removeEventListener('pointermove', syncFromInput, true);
    };
  }, [applyPlayhead]);
  useEffect(() => () => cancelAnimationFrame(snapRaf.current), []);
  const queueSnapshot = (next: number) => {
    cancelAnimationFrame(snapRaf.current);
    snapRaf.current = requestAnimationFrame(() => {
      startTransition(() => onIndex(next));
    });
  };

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => setW(Math.max(160, Math.round(el.clientWidth)));
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [points.length]);

  if (points.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <p className="text-xs text-muted-foreground">No sessions yet.</p>
        {children && <div className="min-h-0 flex-1 overflow-auto">{children}</div>}
      </div>
    );
  }

  const padL = CHART_PAD_L;
  const padR = CHART_PAD_R;
  const topY = 16;
  const botY = 52;
  const railY = 10;
  const svgH = 70;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const span = t1 - t0 || 1;
  const x = (t: number) => padL + (W - padL - padR) * ((t - t0) / span);

  const maxAdded = Math.max(1, ...points.map((p) => p.added));
  const maxRemoved = Math.max(0, ...points.map((p) => p.removed));
  const maxNet = Math.max(1, ...points.map((p) => p.net));
  const yTop = Math.max(maxAdded, maxNet);
  const yBot = -maxRemoved;
  const range = yTop - yBot || 1;
  const yPix = (v: number) => topY + ((yTop - v) / range) * (botY - topY);
  const zeroY = yPix(0);

  const maxDur = Math.max(1, ...points.map((p) => p.dur ?? 0));
  const barW = (dur?: number) => 2.5 + ((dur ?? 0) / maxDur) * 9.5;

  const weekTs = weekBoundaries(t0, t1, tz);
  const weekSet = new Set(weekTs);
  const dayTs = showDayLines(t0, t1, tz)
    ? midnightBoundaries(t0, t1, tz).filter((ts) => !weekSet.has(ts))
    : [];
  const netPath = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${yPix(p.net).toFixed(1)}`).join(' ');

  const thumb = Math.min(playhead, points.length - 1);
  const cur = points[thumb];
  const cx = x(cur.t);
  const meta = formatSessionMeta(cur, tz);
  const spanKey = `${points.length}:${t0}:${t1}`;
  const endDrag = () => {
    dragging.current = false;
    const next = playheadRef.current;
    setPlayhead(next);
    queueSnapshot(next);
  };
  const marks = placeMilestones(milestones, x);

  const chart = (
    <>
      <div className="flex items-baseline justify-between text-[0.65rem] tabular-nums text-muted-foreground">
        <span>{fmtDay(t0, tz)}</span>
        {peakLabel && <span className="font-semibold">{peakLabel}</span>}
        <span>{fmtDay(t1, tz)}</span>
      </div>
      <div ref={wrapRef}>
      <svg viewBox={`0 0 ${W} ${svgH}`} className="block w-full" style={{ height: svgH }} role="img" aria-label="Session diff history; drag the slider to scrub.">
        {weekTs.map((ts, i) => (
          <line
            key={`w-${i}`}
            x1={x(ts).toFixed(1)}
            x2={x(ts).toFixed(1)}
            y1={topY - 2}
            y2={botY}
            stroke="var(--color-muted-foreground)"
            strokeWidth={1}
            opacity={0.28}
          />
        ))}
        {dayTs.map((ts, i) => (
          <line
            key={`d-${i}`}
            x1={x(ts).toFixed(1)}
            x2={x(ts).toFixed(1)}
            y1={topY - 2}
            y2={botY}
            stroke="var(--color-muted-foreground)"
            strokeWidth={1}
            opacity={0.12}
          />
        ))}
        {points.map((p, i) => {
          const w = barW(p.dur);
          const bx = (x(p.t) - w / 2).toFixed(1);
          return (
            <g key={i}>
              {p.added > 0 && (
                <rect x={bx} width={w.toFixed(1)} y={yPix(p.added).toFixed(1)} height={(zeroY - yPix(p.added)).toFixed(1)} rx={1} fill="var(--color-success)" />
              )}
              {p.removed > 0 && (
                <rect x={bx} width={w.toFixed(1)} y={zeroY.toFixed(1)} height={(yPix(-p.removed) - zeroY).toFixed(1)} rx={1} fill="var(--color-primary)" />
              )}
            </g>
          );
        })}
        <line x1={padL} x2={W - padR} y1={zeroY.toFixed(1)} y2={zeroY.toFixed(1)} stroke="var(--color-border)" />
        <path d={netPath} fill="none" stroke="var(--color-foreground)" strokeWidth={1.2} strokeLinejoin="round" />
        {points.map((p, i) => {
          if (!p.ev || p.ev.length === 0) return null;
          const bx = x(p.t);
          const label = p.ev.map((e) => EV_LABEL[e]).filter(Boolean)[0] ?? '';
          const anchor = bx < 24 ? 'start' : bx > W - 24 ? 'end' : 'middle';
          const lx = bx < 24 ? bx - 2 : bx > W - 24 ? bx + 2 : bx;
          return (
            <g key={`ev-${i}`}>
              <circle cx={bx.toFixed(1)} cy={railY} r={2.4} fill="var(--color-info)" />
              <text x={lx.toFixed(1)} y={railY - 4} fontSize={6.5} fill="var(--color-info)" textAnchor={anchor}>
                {label}
              </text>
            </g>
          );
        })}
        {marks.map((m, i) => {
          const bx = m.bx;
          const color = milestoneFill(m.tone);
          const anchor = bx < 24 ? 'start' : bx > W - 24 ? 'end' : 'middle';
          const lx = bx < 24 ? bx - 2 : bx > W - 24 ? bx + 2 : bx;
          return (
            <g key={`ms-${i}`} data-testid="session-milestone" data-tone={m.tone ?? 'export'}>
              {m.title && <title>{m.title}</title>}
              <rect x={(bx - 2.4).toFixed(1)} y={railY - 2.4} width={4.8} height={4.8} rx={0.8} transform={`rotate(45 ${bx.toFixed(1)} ${railY})`} fill={color} />
              <text x={lx.toFixed(1)} y={railY - 4} fontSize={6.5} fill={color} textAnchor={anchor}>
                {m.label}
              </text>
            </g>
          );
        })}
        <line data-testid="session-playhead-line" ref={lineRef} x1={cx.toFixed(1)} x2={cx.toFixed(1)} y1={2} y2={svgH - 2} stroke="var(--color-primary)" strokeWidth={1.5} />
      </svg>
      </div>
    </>
  );

  const scrub =
    points.length <= 1 ? (
      <div className="flex items-stretch gap-2">
        {leftChip}
        {rightChip}
      </div>
    ) : (
      <div className="flex w-full items-center justify-center gap-2">
        {leftChip}
        <div className="relative min-w-0 flex-1 md:w-[var(--admin-nav-tabs-w,22rem)] md:flex-none">
            <div className="pointer-events-none absolute inset-0">
              <div
                className="absolute left-0 right-0 top-1/2 h-[7px] -translate-y-1/2 rounded-full"
                style={{ background: 'var(--color-muted)' }}
              />
              {points.map((_, i) => (
                <span
                  key={i}
                  data-testid="admin-scrub-dot"
                  className="absolute top-1/2 h-[4px] w-[4px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: `calc(${SCRUB_THUMB_PX / 2}px + ${i / (points.length - 1)} * (100% - ${SCRUB_THUMB_PX}px))`,
                    background: 'var(--color-muted-foreground)',
                  }}
                />
              ))}
            </div>
            <input
              ref={inputRef}
              key={spanKey}
              type="range"
              min={0}
              max={points.length - 1}
              step={1}
              defaultValue={index}
              onPointerDown={() => {
                dragging.current = true;
              }}
              onMouseDown={() => {
                dragging.current = true;
              }}
              onPointerUp={endDrag}
              onMouseUp={endDrag}
              onPointerCancel={endDrag}
              onChange={(e) => {
                const next = Number(e.currentTarget.value);
                playheadRef.current = next;
                applyPlayhead(next);
                // Keyboard and Playwright fill() have no pointer-down. Only a
                // held pointer skips the snapshot so a drag cannot rebuild.
                if (dragging.current) return;
                setPlayhead(next);
                queueSnapshot(next);
              }}
              className="admin-scrub relative w-full touch-none"
              aria-label="Scrub sessions"
              aria-valuetext={`${fmtDay(cur.t, tz)}: ${cur.count} ${countUnit}`}
            />
        </div>
        {rightChip}
      </div>
    );

  const readout = (
    <div className="flex flex-nowrap items-baseline gap-x-1 whitespace-nowrap text-[0.65rem] tabular-nums leading-none">
      <b data-testid="session-playhead-count" ref={countRef} className="text-[0.9rem] font-bold">{cur.count}</b>
      <span className="shrink-0 text-muted-foreground">{countUnit}</span>
      <span className="text-muted-foreground">·</span>
      <span data-testid="session-playhead-date" ref={dateRef} className="font-semibold">{fmtDay(cur.t, tz)}</span>
      <span data-testid="session-playhead-window-sep" hidden={!meta.window} className="text-muted-foreground">·</span>
      <span data-testid="session-playhead-window" hidden={!meta.window} className="font-semibold">
        {meta.window ?? ''}
      </span>
      <span data-testid="session-playhead-diff-sep" hidden={!meta.diff} className="text-muted-foreground">·</span>
      <span
        data-testid="session-playhead-added"
        hidden={meta.added == null}
        className="font-bold text-[var(--color-success)]"
      >
        {meta.added != null ? `+${meta.added}${deltaUnit}` : ''}
      </span>
      <span
        data-testid="session-playhead-removed"
        hidden={meta.removed == null}
        className="font-bold text-[var(--color-primary)]"
      >
        {meta.removed != null ? `${meta.added != null ? ' ' : ''}−${meta.removed}${deltaUnit}` : ''}
      </span>
      {extra && <span className="text-muted-foreground">· {extra}</span>}
    </div>
  );

  if (children == null) {
    return (
      <div className="flex flex-col gap-1.5">
        {chart}
        {scrub}
        {readout}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="order-1 shrink-0">{chart}</div>
      <div className="order-2 shrink-0 md:order-3">{readout}</div>
      <div className="order-3 flex min-h-0 flex-1 flex-col overflow-auto md:order-4">{children}</div>
      <div
        data-testid="session-scrubber-dock"
        className={cn(
          'order-4 shrink-0 md:order-2',
          'max-md:sticky max-md:bottom-0 max-md:z-20 max-md:-mx-4 max-md:border-t max-md:bg-card/95 max-md:px-4 max-md:py-1.5 max-md:backdrop-blur',
        )}
      >
        {scrub}
      </div>
    </div>
  );
}
