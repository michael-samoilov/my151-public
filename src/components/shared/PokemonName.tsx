import type { PokemonLabel } from '@/i18n/names';
import { cn } from '@/lib/utils';
import { GENDER_SYMBOL_HEIGHT_EM, genderSymbol } from '@/lib/genderSymbol';

/** Keep a form marker outside the species text so truncation cannot hide it. */
export function PokemonName({ label, className, truncate = true }: {
  label: PokemonLabel;
  className?: string;
  truncate?: boolean;
}) {
  const symbol = label.mark ? genderSymbol(label.mark) : undefined;
  return <span
    data-i18n-exempt="pokemon-name"
    className={cn('flex items-baseline justify-center gap-[0.15em]', className)}
    {...(label.pending ? { 'aria-busy': true } : { title: label.full, 'aria-label': label.full })}
  >
    {label.pending ? <span aria-hidden data-name-skeleton className="flex h-[1.25em] w-[62%] items-center">
      <span className="tile-name-skeleton block h-[0.68em] w-full rounded-full bg-current" />
    </span> : <>
      <span className={truncate ? 'truncate' : undefined}>{label.name}</span>
      {label.mark && <span aria-hidden className="flex-shrink-0 text-[0.8em] font-semibold opacity-70 tabular-nums">
        {symbol ? <>
          <svg viewBox={`0 0 ${symbol.width} 20`} className="inline-block align-baseline"
            style={{ height: `${GENDER_SYMBOL_HEIGHT_EM}em`, width: `${GENDER_SYMBOL_HEIGHT_EM * symbol.width / 20}em` }}
            fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d={symbol.path} />
          </svg>
          <span className="sr-only">{label.mark}</span>
        </> : label.mark}
      </span>}
    </>}
  </span>;
}
