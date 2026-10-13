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
  pinHeader,
}: {
  title: string;
  sub?: React.ReactNode[];
  legend?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Keep the title row at one text-sm line so a chip cannot push the body down. */
  pinHeader?: boolean;
}) {
  return (
    <section
      className={cn(
        'min-w-0 rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(9,9,15,0.05)]',
        className,
      )}
    >
      <div
        className={cn(
          'mb-3 flex min-w-0 justify-between gap-3',
          pinHeader
            ? 'h-[1.09375rem] flex-nowrap items-center'
            : cn('flex-wrap', legend ? 'items-center' : 'items-start'),
        )}
      >
        <h2
          className={cn(
            'min-w-0 text-sm font-bold leading-tight',
            pinHeader && 'truncate',
            legend && 'flex items-center gap-2.5',
          )}
        >
          {title}
          {legend}
          {sub?.map((s, i) => (
            <span key={i} className="ml-1.5 text-[0.7rem] font-semibold text-muted-foreground">
              · {s}
            </span>
          ))}
        </h2>
        {actions && <div className={cn('shrink-0', pinHeader && 'flex h-full items-center')}>{actions}</div>}
      </div>
      {children}
    </section>
  );
}

interface SegOption<K extends string> {
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

