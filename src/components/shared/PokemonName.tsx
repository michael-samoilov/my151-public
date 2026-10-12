import type { PokemonLabel } from '@/i18n/names';
import { cn } from '@/lib/utils';
import { genderSymbol } from '@/lib/genderSymbol';
import { PokemonGenderSymbol } from './PokemonNameText';

/** Keep a form marker outside the species text so truncation cannot hide it. */
export function PokemonName({ label, className, truncate = true }: {
  label: PokemonLabel;
  className?: string;
  truncate?: boolean;
}) {
  const parts = label.mark?.split(/([♂♀])/u).filter(Boolean) ?? [];
  return <span
    data-i18n-exempt="pokemon-name"
    className={cn('flex items-baseline justify-center gap-[0.15em]', className)}
    {...(label.pending ? { 'aria-busy': true } : { title: label.mark && !/[♂♀]/u.test(label.full) ? label.full : undefined, 'aria-label': label.full })}
  >
    {label.pending ? <span aria-hidden data-name-skeleton className="load-delay flex h-[1.25em] w-[62%] items-center">
      <span className="tile-name-skeleton block h-[0.68em] w-full rounded-full bg-current" />
    </span> : <>
      <span className={truncate ? 'truncate' : undefined}>{label.name}</span>
      {label.mark && <span data-form-indicator aria-hidden className="flex-shrink-0 text-[0.8em] font-semibold opacity-70 tabular-nums">
        {parts.map((part, index) => {
          return genderSymbol(part) ? <PokemonGenderSymbol key={index} mark={part} /> : <span key={index}>{part}</span>;
        })}
      </span>}
    </>}
  </span>;
}
