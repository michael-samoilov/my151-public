import { Fragment, useState } from 'react';
import type { HeatmapClock } from '../../../api/_aggregate';
import { Panel, Seg } from '@/components/admin/ui';
import { cn } from '@/lib/utils';

const CLOCK_OPTIONS: { key: HeatmapClock; label: string }[] = [
  { key: 'local', label: 'Local time' },
  { key: 'eastern', label: 'Eastern Time' },
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hourShort = (h: number) => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
const hourLong = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

interface Axis {
  n: number;
  label: (i: number) => string;
  /** Label every `every`th slot. */
  every: number;
  totals: number[];
}

/**
 * Day-by-hour heatmap of browsers, each counted once in every weekday hour it
 * was active in, on one of two clocks. Wide containers put days down and hours
 * across. Below 32rem, 24 hour columns leave no room for their totals, so the
 * axes swap. Both layouts render and a container query shows one: a width
 * measured after mount changed the card's height after Back had already
 * restored the dashboard scroll. Each row and column ends in its total, in
 * browser-hours. A mouse reads a cell out on hover; a tap toggles the readout,
 * so it stays up while the clock changes.
 */
export function HeatmapCard({ heatmaps }: { heatmaps: Record<HeatmapClock, number[][]> }) {
  const [clock, setClock] = useState<HeatmapClock>('local');
  const [active, setActive] = useState<{ dow: number; hour: number } | null>(null);
  const matrix = heatmaps[clock];
  const max = Math.max(1, ...matrix.flat());
  const dayTotals = matrix.map(sum);
  const hourTotals = Array.from({ length: 24 }, (_, h) => sum(matrix.map((row) => row[h])));
  const total = sum(dayTotals);
  const label = 'flex items-center text-xs leading-none text-muted-foreground';
  const num = 'flex items-center justify-center text-xs leading-none tabular-nums text-muted-foreground';

  const grid = (landscape: boolean) => {
    const days: Axis = { n: 7, label: (i) => DAYS[i], every: 1, totals: dayTotals };
    const hours: Axis = { n: 24, label: hourShort, every: landscape ? 3 : 1, totals: hourTotals };
    const [down, across] = landscape ? [days, hours] : [hours, days];
    const slotAt = (r: number, c: number) => (landscape ? { dow: r, hour: c } : { dow: c, hour: r });
    return (
      <div
        data-testid="heatmap-grid"
        data-layout={landscape ? 'landscape' : 'portrait'}
        role="img"
        aria-label={`${CLOCK_OPTIONS.find((o) => o.key === clock)?.label}: ${total} browser-hours by day and hour`}
        className={cn('w-full gap-px', landscape ? 'hidden @min-[32rem]:grid' : 'grid @min-[32rem]:hidden')}
        style={{ gridTemplateColumns: `auto repeat(${across.n}, minmax(0, 1fr)) auto` }}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
      >
        <div />
        {Array.from({ length: across.n }, (_, c) => (
          <div key={c} className={cn(num, 'pb-0.5')}>
            {c % across.every === 0 ? across.label(c) : ''}
          </div>
        ))}
        <div className={cn(num, 'pb-0.5 pl-1')}>Σ</div>

        {Array.from({ length: down.n }, (_, r) => (
          <Fragment key={r}>
            <div className={cn(label, 'justify-end pr-1')}>{r % down.every === 0 ? down.label(r) : ''}</div>
            {Array.from({ length: across.n }, (_, c) => {
              const slot = slotAt(r, c);
              const n = matrix[slot.dow][slot.hour];
              const on = active?.dow === slot.dow && active.hour === slot.hour;
              return (
                <div
                  key={c}
                  data-testid="heatmap-cell"
                  className={cn(
                    'relative rounded-[2px]',
                    landscape ? 'aspect-[4/3]' : 'h-[0.875rem]',
                    on && 'z-10 ring-1 ring-foreground',
                  )}
                  style={{
                    backgroundColor:
                      `color-mix(in srgb, var(--color-primary) ${(100 * n) / max}%, var(--color-muted))`,
                  }}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && setActive(slot)}
                  onPointerUp={(e) => e.pointerType !== 'mouse' && setActive(on ? null : slot)}
                >
                  {on && (
                    <span
                      role="tooltip"
                      className={cn(
                        'pointer-events-none absolute bottom-full mb-1 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[0.65rem] font-semibold text-card',
                        c < across.n / 3 ? 'left-0' : c >= (2 * across.n) / 3 ? 'right-0' : 'left-1/2 -translate-x-1/2',
                      )}
                    >
                      {DAYS[slot.dow]} {hourLong(slot.hour)} · {n}
                    </span>
                  )}
                </div>
              );
            })}
            <div className={cn(num, 'pl-1')}>{down.totals[r]}</div>
          </Fragment>
        ))}

        <div className={cn(label, 'justify-end pr-1 pt-0.5')}>Σ</div>
        {across.totals.map((t, c) => (
          <div key={c} className={cn(num, 'pt-0.5')}>
            {t}
          </div>
        ))}
        <div className={cn(num, 'pl-1 pt-0.5 font-bold text-foreground')}>{total}</div>
      </div>
    );
  };

  return (
    <Panel
      title="When"
      sub={['active hours']}
      actions={<Seg ariaLabel="Clock" options={CLOCK_OPTIONS} value={clock} onChange={setClock} />}
    >
      <div className="@container">
        {grid(true)}
        {grid(false)}
      </div>
    </Panel>
  );
}
