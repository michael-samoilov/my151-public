import { Fragment } from 'react';
import { GENDER_SYMBOL_HEIGHT_EM, genderSymbol } from '@/lib/genderSymbol';

export function PokemonGenderSymbol({ mark }: { mark: string }) {
  const symbol = genderSymbol(mark);
  if (!symbol) return null;
  return <span>
    <svg aria-hidden data-gender-symbol={mark} viewBox={`0 0 ${symbol.width} 20`} className="inline-block align-baseline"
      style={{ height: `${GENDER_SYMBOL_HEIGHT_EM}em`, width: `${GENDER_SYMBOL_HEIGHT_EM * symbol.width / 20}em` }}
      fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={symbol.path} />
    </svg>
    <span className="sr-only">{mark}</span>
  </span>;
}

export function PokemonNameText({ name }: { name: string }) {
  return <>{name.split(/([♂♀])/u).map((part, index) => genderSymbol(part)
    ? <span key={index} className="text-[0.8em] font-semibold opacity-70"><PokemonGenderSymbol mark={part} /></span>
    : <Fragment key={index}>{part}</Fragment>)}</>;
}
