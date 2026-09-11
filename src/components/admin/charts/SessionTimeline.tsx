import type { ReactNode } from 'react';

/** One session on the timeline. `count` is the headline number shown in the
 *  readout (dex: ids placed; league: cards). `net` is the running size the net
 *  line tracks (dex: ids; league: seated lines). `added`/`removed` are the
 *  insertions and deletions that session — shown as up/down diff bars, never
 *  netted. `dur` is seconds; `ev` are funnel events seen that session. */
export interface TimelinePoint {
  t: number;
  count: number;
  net: number;
  added: number;
  removed: number;
  dur?: number;
  ev?: string[];
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDay = (t: number) => `${MON[new Date(t).getUTCMonth()]} ${new Date(t).getUTCDate()}`;
const fmtClock = (t: number) =>
  new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
const EV_LABEL: Record<string, string> = {
  'intro-shown': 'intro',
  'intro-cta': 'start',
  'milestone-25': '25',
  'milestone-100': '100',
  'milestone-151': '151',
  'view-visit': 'view',
};

/** Each Sunday-00:00 UTC boundary in [t0, t1] — the midnight between Saturday
 *  and Sunday, so the count of lines is the count of calendar weeks touched. */
function weekBoundaries(t0: number, t1: number): number[] {
  const out: number[] = [];
  const d = new Date(t0);
  d.setUTCHours(0, 0, 0, 0);
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
  for (let ts = d.getTime(); ts <= t1; ts += 7 * 86_400_000) {
    if (ts >= t0) out.push(ts);
  }
  return out;
}

/**
 * Bespoke session-history diff timeline. Each session is placed by timestamp (so
 * spacing is elapsed time) and shows its insertions up in green and deletions
 * down in red — never netted, so a session that swapped members reads as both. A
 * line tracks the running size on the same axis. Grey verticals mark each
 * Saturday→Sunday midnight, so the reader can count the weeks used. Event dots
 * ride a rail on top; a red playhead marks the scrubbed session; the slider
 * scrubs and the readout states the count, date, duration, and the diff.
 */
export function SessionTimeline({
  points,
  index,
  onIndex,
  countUnit,
  deltaUnit = '',
  peakLabel,
  leftChip,
  rightChip,
  milestones = [],
}: {
  points: TimelinePoint[];
  index: number;
  onIndex: (i: number) => void;
  countUnit: string;
  deltaUnit?: string;
  peakLabel?: string;
  leftChip?: ReactNode;
  rightChip?: ReactNode;
  milestones?: { t: number; label: string; tone?: 'export' | 'muted' }[];
}) {
  if (points.length === 0) return <p className="text-xs text-muted-foreground">No sessions yet.</p>;

  const W = 320;
  const padL = 6;
  const padR = 6;
  const topY = 20;
  const botY = 74;
  const railY = 12;
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

  // Bar width tracks the session's real length, so a long session reads wider.
  const maxDur = Math.max(1, ...points.map((p) => p.dur ?? 0));
  const barW = (dur?: number) => 2.5 + ((dur ?? 0) / maxDur) * 9.5;

  const weeks = weekBoundaries(t0, t1);
  const netPath = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${yPix(p.net).toFixed(1)}`).join(' ');

  const cur = points[Math.min(index, points.length - 1)];
  const cx = x(cur.t);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 text-[0.62rem] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-[6px] w-[6px] rounded-[1px]" style={{ background: 'var(--color-success)' }} /> added</span>
        <span className="flex items-center gap-1"><span className="inline-block h-[6px] w-[6px] rounded-[1px]" style={{ background: 'var(--color-primary)' }} /> removed</span>
        <span className="flex items-center gap-1"><span className="inline-block h-[2px] w-3" style={{ background: 'var(--color-foreground)' }} /> size</span>
      </div>

      <div className="flex items-baseline justify-between text-[0.7rem] tabular-nums text-muted-foreground">
        <span>{fmtDay(t0)}</span>
        {peakLabel && <span className="font-semibold">{peakLabel}</span>}
        <span>{fmtDay(t1)}</span>
      </div>

      <svg viewBox={`0 0 ${W} 96`} className="block w-full" style={{ height: 'auto' }} role="img" aria-label="Session diff history; drag the slider to scrub.">
        {/* week boundaries (Sat→Sun midnight), so weeks used are countable */}
        {weeks.map((ts, i) => (
          <line key={`wk-${i}`} x1={x(ts).toFixed(1)} x2={x(ts).toFixed(1)} y1={topY - 4} y2={botY} stroke="var(--color-muted-foreground)" strokeWidth={0.7} strokeDasharray="2 2" opacity={0.5} />
        ))}
        {/* diff bars: insertions up (green), deletions down (red) */}
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
        {/* zero baseline */}
        <line x1={padL} x2={W - padR} y1={zeroY.toFixed(1)} y2={zeroY.toFixed(1)} stroke="var(--color-border)" />
        {/* running-size line, on the same axis as the bars */}
        <path d={netPath} fill="none" stroke="var(--color-foreground)" strokeWidth={1.2} strokeLinejoin="round" />
        <text x={W - 2} y={topY + 4} fontSize={6.5} fill="var(--color-muted-foreground)" textAnchor="end">+{yTop}</text>
        {maxRemoved > 0 && (
          <text x={W - 2} y={botY - 1} fontSize={6.5} fill="var(--color-muted-foreground)" textAnchor="end">−{maxRemoved}</text>
        )}
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
        {/* milestones (exports, or a "no exports" marker) */}
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
        {/* playhead */}
        <line x1={cx.toFixed(1)} x2={cx.toFixed(1)} y1={2} y2={94} stroke="var(--color-primary)" strokeWidth={1.5} />
      </svg>

      {/* One session: no scrubber; the summary chips split the width. */}
      {points.length <= 1 ? (
        <div className="flex items-stretch gap-2">
          {leftChip}
          {rightChip}
        </div>
      ) : (
      /* The rail, flanked by the session-count (left) and time-spent (right)
         summaries. A dot marks every session the thumb clamps to, drawn under
         the transparent track so drag distance to the next state is legible.
         The rail is inset from the chips, so a drag from the rim doesn't start
         a back gesture or catch the page scrollbar. */
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
          aria-valuetext={`${fmtDay(cur.t)}: ${cur.count} ${countUnit}`}
        />
        </div>
        {rightChip}
      </div>
      )}

      <div className="flex flex-wrap items-baseline gap-2">
        <b className="text-3xl leading-none tabular-nums">{cur.count}</b>
        <span className="text-sm text-muted-foreground">{countUnit}</span>
        <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[0.7rem] font-semibold tabular-nums">{fmtDay(cur.t)}</span>
        {cur.dur != null && (
          <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[0.7rem] font-semibold tabular-nums">
            {fmtClock(cur.t)}–{fmtClock(cur.t + cur.dur * 1000)} · {Math.round(cur.dur / 60)}m
          </span>
        )}
        {cur.added > 0 && (
          <span className="rounded px-1.5 py-0.5 text-[0.7rem] font-bold tabular-nums text-[var(--color-success)]">
            +{cur.added}
            {deltaUnit}
          </span>
        )}
        {cur.removed > 0 && (
          <span className="rounded px-1.5 py-0.5 text-[0.7rem] font-bold tabular-nums text-[var(--color-primary)]">
            −{cur.removed}
            {deltaUnit}
          </span>
        )}
      </div>
    </div>
  );
}
