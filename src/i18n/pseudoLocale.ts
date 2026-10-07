export const PSEUDO_LOCALES = ['en-XA', 'en-XC'] as const;
export type PseudoLocale = (typeof PSEUDO_LOCALES)[number];

export function isPseudoLocale(value: unknown): value is PseudoLocale {
  return typeof value === 'string' && (PSEUDO_LOCALES as readonly string[]).includes(value);
}

