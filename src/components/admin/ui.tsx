import { cn } from '@/lib/utils';

/**
 * Shared design grammar for the admin dashboard, ported from the reviewed
 * mockup: a titled panel with a "Title · qualifier · qualifier" caption, an
 * ink-fill segmented toggle, big-number KPI tiles with denominators, neutral
 * delta chips (the sign carries direction, so no good/bad color), and rollup
 * bar rows. Red stays reserved for data-movement (charts), never selection.
 */

/** Card container with a caption row. `sub` items render as "· a · b" after
 *  the title; `legend` is a vertically centered row after the title with no
 *  dots; `actions` (usually a Seg) sit at the right of the header. */
export function Panel({
  title,
  sub,
  legend,
  actions,
  children,
  className,
}: {
  title: string;
  sub?: React.ReactNode[];
  legend?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(9,9,15,0.05)]',
        className,
      )}
    >
      <div className={cn('mb-3 flex justify-between gap-3', legend ? 'items-center' : 'items-start')}>
        <h2 className={cn('text-sm font-bold leading-tight', legend && 'flex items-center gap-2.5')}>
          {title}
          {legend}
          {sub?.map((s, i) => (
            <span key={i} className="ml-1.5 text-[0.7rem] font-semibold text-muted-foreground">
              · {s}
            </span>
          ))}
        </h2>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export interface SegOption<K extends string> {
  key: K;
  label: string;
}

/** Ink-fill segmented toggle. The selected option is filled with foreground
 *  ink; the rest read as quiet outlines. Every button carries aria-pressed. */
export function Seg<K extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegOption<K>[];
  value: K;
  onChange: (key: K) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap items-center gap-1">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.key)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold transition-colors',
              on
                ? 'border-foreground bg-foreground text-card'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Big-number KPI tile. `value` is the headline; `denom` rides beneath as data
 *  (e.g. "17 / 65 · 26%"); `delta` is an optional neutral chip. */
export function Kpi({
  value,
  label,
  denom,
  delta,
  emphasis,
}: {
  value: React.ReactNode;
  label: string;
  denom?: React.ReactNode;
  delta?: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="flex min-w-[6.5rem] flex-col">
      <div className="flex items-baseline gap-1.5">
        <span className={cn('font-bold tabular-nums leading-none', emphasis ? 'text-4xl' : 'text-2xl')}>
          {value}
        </span>
        {delta}
      </div>
      <span className="mt-1 text-xs font-semibold text-muted-foreground">{label}</span>
      {denom != null && <span className="text-[0.7rem] font-medium text-muted-foreground/80">{denom}</span>}
    </div>
  );
}

/** Neutral delta chip: the sign carries direction, so this stays gray — never a
 *  good/bad color judgment. Pass a preformatted string like "+3 wk". */
export function Delta({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-bold tabular-nums text-muted-foreground">
      {children}
    </span>
  );
}

export interface RollupRow {
  label: React.ReactNode;
  pct: number;
  /** Optional per-row delta vs a baseline (points). */
  delta?: number;
}

/** Aggregate rollup bars (device / region / browser). One shared linear scale
 *  from zero, so bar length reads as the share it encodes. */
export function Rollup({ rows }: { rows: RollupRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.pct));
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-[0.72rem]">
          <span className="min-w-[4.5rem] whitespace-nowrap text-muted-foreground">{r.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.round((r.pct / max) * 100)}%`, backgroundColor: 'var(--color-muted-foreground)' }}
            />
          </span>
          <span className="text-right font-bold tabular-nums text-foreground">
            {r.pct}%
            {r.delta != null && r.delta !== 0 && (
              <span className="ml-1 text-[0.62rem] font-bold text-muted-foreground">
                {r.delta > 0 ? '+' : ''}
                {r.delta}pt
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
