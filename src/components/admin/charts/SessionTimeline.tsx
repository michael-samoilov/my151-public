import { cn } from '@/lib/utils';

/** One session on the timeline. `count` is the headline number shown in the
 *  readout (dex: ids placed; league: cards). `magnitude` is the value whose
 *  session-over-session delta drives the bar height (dex: ids; league: seated
 *  lines). `dur` is seconds; `ev` are funnel events seen that session. */
export interface TimelinePoint {
  t: number;
  count: number;
  magnitude: number;
  dur?: number;
  ev?: string[];
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDay = (t: number) => `${MON[new Date(t).getUTCMonth()]} ${new Date(t).getUTCDate()}`;
const EV_LABEL: Record<string, string> = {
  'intro-shown': 'intro',
  'intro-cta': 'start',
  'milestone-25': '25',
  'milestone-100': '100',
  'milestone-151': '151',
  'view-visit': 'view',
};

/**
 * Bespoke session-history timeline, ported from the mockup: a diff bar per
 * session placed chronologically (x by timestamp, so spacing is elapsed time),
 * height = the session's net change on one shared linear scale, gain up in green
 * and loss down in neutral gray. Event dots ride a rail on top; a red playhead
 * marks the scrubbed session. The slider below scrubs; the readout states the
 * count, date, duration and delta.
 */
export function SessionTimeline({
  points,
  index,
  onIndex,
  countUnit,
  deltaUnit = '',
  peakLabel,
}: {
  points: TimelinePoint[];
  index: number;
  onIndex: (i: number) => void;
  countUnit: string;
  deltaUnit?: string;
  peakLabel?: string;
}) {
  if (points.length === 0) return <p className="text-xs text-muted-foreground">No sessions yet.</p>;

  const W = 320;
  const padL = 6;
  const padR = 6;
  const baseY = 64;
  const railY = 12;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const span = t1 - t0 || 1;
  const x = (t: number) => padL + (W - padL - padR) * ((t - t0) / span);
  const deltas = points.map((p, i) => p.magnitude - (i ? points[i - 1].magnitude : 0));
  const ref = Math.max(1, ...deltas.map((d) => Math.abs(d)));
  // Bar width tracks the session's real length, so a long session reads wider
  // than a short one. Position still comes from the timestamp, so spacing is
  // elapsed time. Sessions without a duration fall back to the thinnest bar.
  const maxDur = Math.max(1, ...points.map((p) => p.dur ?? 0));
  const barW = (dur?: number) => 2.5 + ((dur ?? 0) / maxDur) * 9.5;

  const cur = points[Math.min(index, points.length - 1)];
  const curDelta = deltas[Math.min(index, points.length - 1)];
  const cx = x(cur.t);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-[0.7rem] tabular-nums text-muted-foreground">
        <span>{fmtDay(t0)}</span>
        {peakLabel && <span className="font-semibold">{peakLabel}</span>}
        <span>{fmtDay(t1)}</span>
      </div>

      <svg viewBox={`0 0 ${W} 96`} className="block w-full" style={{ height: 'auto' }} role="img" aria-label="Session history; drag the slider to scrub.">
        {/* diff bars */}
        {points.map((p, i) => {
          const d = deltas[i];
          const h = Math.max(1.5, (Math.abs(d) / ref) * 30);
          const w = barW(p.dur);
          return (
            <rect
              key={i}
              x={(x(p.t) - w / 2).toFixed(1)}
              width={w.toFixed(1)}
              y={(d >= 0 ? baseY - h : baseY).toFixed(1)}
              height={h.toFixed(1)}
              rx={1}
              fill={d >= 0 ? 'var(--color-success)' : 'var(--color-sink)'}
            />
          );
        })}
        <line x1={padL} x2={W - padR} y1={baseY} y2={baseY} stroke="var(--color-border)" />
        <text x={W - 2} y={baseY - 30} fontSize={6.5} fill="var(--color-muted-foreground)" textAnchor="end">
          +{ref}
        </text>
        <text x={W - 2} y={baseY + 22} fontSize={6.5} fill="var(--color-muted-foreground)" textAnchor="end">
          −{ref}
        </text>
        {/* event dots + labels on the rail */}
        {points.map((p, i) => {
          if (!p.ev || p.ev.length === 0) return null;
          const bx = x(p.t);
          const label = p.ev.map((e) => EV_LABEL[e]).filter(Boolean)[0] ?? '';
          const anchor = bx < 24 ? 'start' : bx > W - 24 ? 'end' : 'middle';
          const lx = bx < 24 ? bx - 2 : bx > W - 24 ? bx + 2 : bx;
          return (
            <g key={`ev-${i}`}>
              <circle cx={bx.toFixed(1)} cy={railY} r={2.6} fill="var(--color-info)" />
              <text x={lx.toFixed(1)} y={railY - 4} fontSize={6.5} fill="var(--color-info)" textAnchor={anchor}>
                {label}
              </text>
            </g>
          );
        })}
        {/* playhead */}
        <line x1={cx.toFixed(1)} x2={cx.toFixed(1)} y1={2} y2={94} stroke="var(--color-primary)" strokeWidth={1.5} />
      </svg>

      <input
        type="range"
        min={0}
        max={points.length - 1}
        step={1}
        value={Math.min(index, points.length - 1)}
        onChange={(e) => onIndex(Number(e.target.value))}
        className="admin-scrub w-full"
        aria-label="Scrub sessions"
        aria-valuetext={`${fmtDay(cur.t)}: ${cur.count} ${countUnit}`}
      />

      <div className="flex flex-wrap items-baseline gap-2">
        <b className="text-3xl leading-none tabular-nums">{cur.count}</b>
        <span className="text-sm text-muted-foreground">{countUnit}</span>
        <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[0.7rem] font-semibold tabular-nums">{fmtDay(cur.t)}</span>
        {cur.dur != null && (
          <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[0.7rem] font-semibold tabular-nums">
            {Math.round(cur.dur / 60)}m
          </span>
        )}
        {curDelta !== 0 && (
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[0.7rem] font-bold tabular-nums',
              curDelta > 0 ? 'text-[var(--color-success)]' : 'text-muted-foreground',
            )}
          >
            {curDelta > 0 ? '+' : ''}
            {curDelta}
            {deltaUnit}
          </span>
        )}
      </div>
    </div>
  );
}
