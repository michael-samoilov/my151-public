/**
 * Public surface of the i18n layer.
 *
 * Inside components use the hooks (`useT`, `useTn`, `useLocale`) so the tree
 * re-renders on a locale change. Outside the tree — the canvas exporters, or
 * anything building a string in a plain function — use `t`/`tn` directly; they
 * read the same store.
 */
export { LOCALES, LOCALE_META, DEFAULT_LOCALE, isLocale, htmlLang, direction } from './config';
export type { Locale } from './config';

export {
  getLocale,
  setCatalog,
  formatList,
  formatListToParts,
  formatNumber,
  localeUppercase,
  rawMessage as raw,
  translate as t,
  translatePlural as tn,
} from './core';

export { matchLocale, negotiateLocale, localeFromUrl, resolveLocale } from './detect';

export { typeLabel, typeLabels, colorLabel, eggGroupLabel, shapeLabel } from './terms';

export {
  sectionName,
  categoryName,
  categorySubgroupLabel,
  categoryColumnLabel,
  archetypeName,
  archetypeDescription,
  archetypeSubgroupLabel,
  regionName,
} from './dataLabels';

export { tierOf, keysByTier, LAUNCH_TIERS } from './tiers';
export type { Tier } from './tiers';

export { useT, useTn, useLocale, useNamesVersion, useDocumentLocale } from './provider';
export { speciesName, formLabel, formProvenance, speciesSearchText, pokemonLabel } from './names';
export type { PokemonLabel } from './names';
export { normalizeSearch } from './searchNormalize';

export type { MessageKey, Messages, NoArgKey, TFn, TnFn, PluralBase } from './types';
