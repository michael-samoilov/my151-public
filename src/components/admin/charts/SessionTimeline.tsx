import type { ReactNode } from 'react';
import {
  fmtDay,
  formatSessionMeta,
  midnightBoundaries,
  weekBoundaries,
  type TimelinePoint,
} from './sessionTimelineMath';

export type { TimelinePoint };

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
  milestones?: { t: number; label: string; tone?: 'export' | 'muted' }[];
  tz?: string;
}) {
  if (points.length === 0) return <p className="text-xs text-muted-foreground">No sessions yet.</p>;

  const W = 320;
  const padL = 6;
  const padR = 6;
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

  const midnights = midnightBoundaries(t0, t1, tz);
  const weeks = new Set(weekBoundaries(t0, t1, tz));
  const netPath = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${yPix(p.net).toFixed(1)}`).join(' ');

  const cur = points[Math.min(index, points.length - 1)];
  const cx = x(cur.t);
  const meta = formatSessionMeta(cur, tz);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-[0.65rem] tabular-nums text-muted-foreground">
        <span>{fmtDay(t0, tz)}</span>
        {peakLabel && <span className="font-semibold">{peakLabel}</span>}
        <span>{fmtDay(t1, tz)}</span>
      </div>

      <svg viewBox={`0 0 ${W} ${svgH}`} className="block w-full" style={{ height: 'auto' }} role="img" aria-label="Session diff history; drag the slider to scrub.">
        {midnights.map((ts, i) => (
          <line
            key={`d-${i}`}
            x1={x(ts).toFixed(1)}
            x2={x(ts).toFixed(1)}
            y1={topY - 2}
            y2={botY}
            stroke="var(--color-muted-foreground)"
            strokeWidth={weeks.has(ts) ? 0.8 : 0.4}
            strokeDasharray={weeks.has(ts) ? '2 2' : '1 3'}
            opacity={weeks.has(ts) ? 0.45 : 0.22}
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
        {milestones.map((m, i) => {
          const bx = x(m.t);
          const color = m.tone === 'muted' ? 'var(--color-muted-foreground)' : 'var(--color-success)';
          const anchor = bx < 24 ? 'start' : bx > W - 24 ? 'end' : 'middle';
          const lx = bx < 24 ? bx - 2 : bx > W - 24 ? bx + 2 : bx;
          return (
            <g key={`ms-${i}`}>
              <rect x={(bx - 2.4).toFixed(1)} y={railY - 2.4} width={4.8} height={4.8} rx={0.8} transform={`rotate(45 ${bx.toFixed(1)} ${railY})`} fill={color} />
              <text x={lx.toFixed(1)} y={railY - 4} fontSize={6.5} fill={color} textAnchor={anchor}>
                {m.label}
              </text>
            </g>
          );
        })}
        <line x1={cx.toFixed(1)} x2={cx.toFixed(1)} y1={2} y2={svgH - 2} stroke="var(--color-primary)" strokeWidth={1.5} />
      </svg>

      {points.length <= 1 ? (
        <div className="flex items-stretch gap-2">
          {leftChip}
          {rightChip}
        </div>
      ) : (
      <div className="flex items-center gap-2">
        {leftChip}
        <div className="relative flex-1 px-3">
        <div className="pointer-events-none absolute inset-y-0 left-3 right-3">
          <div
            className="absolute left-0 right-0 top-1/2 h-[7px] -translate-y-1/2 rounded-full"
            style={{ background: 'var(--color-muted)' }}
          />
          {points.length > 1 &&
            points.map((_, i) => (
              <span
                key={i}
                className="absolute top-1/2 h-[4px] w-[4px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ left: `calc(11px + ${i / (points.length - 1)} * (100% - 22px))`, background: 'var(--color-muted-foreground)' }}
              />
            ))}
        </div>
        <input
          type="range"
          min={0}
          max={points.length - 1}
          step={1}
          value={Math.min(index, points.length - 1)}
          onChange={(e) => onIndex(Number(e.target.value))}
          className="admin-scrub relative w-full touch-none"
          aria-label="Scrub sessions"
          aria-valuetext={`${fmtDay(cur.t, tz)}: ${cur.count} ${countUnit}`}
        />
        </div>
        {rightChip}
      </div>
      )}

      <div className="flex flex-nowrap items-baseline gap-x-1 whitespace-nowrap text-[0.65rem] tabular-nums leading-none">
        <b className="text-[0.9rem] font-bold">{cur.count}</b>
        <span className="shrink-0 text-muted-foreground">{countUnit}</span>
        <span className="text-muted-foreground">·</span>
        <span className="font-semibold">{fmtDay(cur.t, tz)}</span>
        {meta.window && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="font-semibold">{meta.window}</span>
          </>
        )}
        {meta.diff && (
          <>
            <span className="text-muted-foreground">·</span>
            {meta.added != null && (
              <span className="font-bold text-[var(--color-success)]">
                +{meta.added}{deltaUnit}
              </span>
            )}
            {meta.removed != null && (
              <span className="font-bold text-[var(--color-primary)]">
                {meta.added != null ? ' ' : ''}−{meta.removed}{deltaUnit}
              </span>
            )}
          </>
        )}
        {extra && <span className="text-muted-foreground">· {extra}</span>}
      </div>
    </div>
  );
}
