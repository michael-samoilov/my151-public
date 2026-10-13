/**
 * Public surface of the i18n layer.
 *
 * Inside components use the hooks (`useT`, `useTn`, `useLocale`) so the tree
 * re-renders on a locale change. Outside the tree — the canvas exporters, or
 * anything building a string in a plain function — use `t`/`tn` directly; they
 * read the same store.
 */
export { LOCALES, LOCALE_META, htmlLang } from './config';
export type { Locale } from './config';

export {
  getLocale,
  getVersion,
  formatList,
  formatListToParts,
  formatNumber,
  localeUppercase,
  rawMessage as raw,
  translate as t,
  translatePlural as tn,
} from './core';

export { typeLabel, typeLabels, colorLabel, eggGroupLabel, shapeLabel } from './terms';

export {
  sectionName,
  categoryName,
  categorySubgroupLabel,
  categoryColumnLabel,
  archetypeName,
  archetypeSubgroupLabel,
  regionName,
} from './dataLabels';

export { useT, useTn, useLocale, useNamesVersion, useDocumentLocale } from './provider';
export { speciesName, speciesSearchText, pokemonLabel, spriteAlt } from './names';
export { normalizeSearch } from './searchNormalize';

export type { MessageKey, NoArgKey, TFn, TnFn } from './types';
