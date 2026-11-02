import { cn } from '@/lib/utils';

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
      <div className="flex flex-wrap items-stretch gap-x-1.5 gap-y-1">
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

export function Delta({ parts }: { parts: readonly string[] }) {
  return (
    <span data-delta className="flex flex-col justify-center rounded bg-muted px-1.5 text-[0.65rem] font-bold leading-[1.1] tabular-nums text-muted-foreground">
      {parts.map((part, i) => <span key={i} className="whitespace-nowrap">{part}</span>)}
    </span>
  );
}

