import { DEFAULT_LOCALE, type Locale } from './config';
import { en } from './catalogs/en';
import type { ArgsOf, MessageKey, Messages, PluralBase, PluralCategory } from './types';

/**
 * The locale store. Deliberately free of React so the canvas exporters in
 * lib/exportImage.ts and lib/exportStats.ts — which run outside the tree — can
 * read the same strings the DOM is showing. provider.tsx subscribes to this.
 */

let currentLocale: Locale = DEFAULT_LOCALE;
let currentMessages: Messages = en;
const subscribers = new Set<() => void>();

/** Bumped on every change so `useSyncExternalStore` sees a new snapshot. */
let version = 0;

export function getLocale(): Locale {
  return currentLocale;
}

export function getVersion(): number {
  return version;
}

export function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/**
 * Swap locale and catalog together in one emit, so no render can observe the
 * new locale against the old strings.
 */
export function setCatalog(locale: Locale, messages: Messages): void {
  currentLocale = locale;
  currentMessages = messages;
  version += 1;
  subscribers.forEach((cb) => cb());
}

const PLACEHOLDER = /\{(\w+)\}/g;

function interpolate(
  template: string,
  args?: Record<string, string | number>,
): string {
  if (!args) return template;
  return template.replace(PLACEHOLDER, (whole, name: string) =>
    // An unknown placeholder is left verbatim rather than blanked, so a bad
    // translation shows `{count}` on screen instead of a confusing gap. The
    // build-time checks are what stop it reaching a user.
    Object.prototype.hasOwnProperty.call(args, name) ? String(args[name]) : whole,
  );
}

/**
 * Look a key up in the active catalog, falling back to English. English is
 * statically bundled and every key is mandatory there, so `lookup` can only
 * miss while a lazily-loaded catalog is still in flight.
 */
function lookup(key: string): string {
  const value = (currentMessages as Record<string, string | undefined>)[key];
  if (value !== undefined) return value;
  const fallback = (en as Record<string, string | undefined>)[key];
  if (fallback !== undefined) return fallback;
  // Surfacing the key beats rendering an empty element; the parity gate in
  // verify.ts is what prevents this in a shipped build.
  return key;
}

/**
 * Strictly typed on purpose: the argument tuple is derived from the English
 * source string, so a missing, misspelled or surplus placeholder argument is a
 * compile error rather than a `{count}` rendered to a user.
 */
export function translate<K extends MessageKey>(key: K, ...args: ArgsOf<K>): string {
  return interpolate(lookup(key), args[0] as Record<string, string | number> | undefined);
}

/**
 * The message text with its placeholders left intact.
 *
 * For sentences whose slots are filled by something other than a string — an
 * icon, a coloured run of text — where `splitTemplate` does the substitution.
 * `translate` would demand the arguments it cannot be given here.
 */
export function rawMessage(key: MessageKey): string {
  return lookup(key);
}

const pluralRulesCache = new Map<string, Intl.PluralRules>();

function pluralRules(locale: Locale): Intl.PluralRules {
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRulesCache.set(locale, rules);
  }
  return rules;
}

/**
 * Resolve a counted message. Picks the CLDR category for `count` in the active
 * locale and falls back to `_other`, which every catalog is required to define
 * — so a locale that omits `_one` (ja, ko, zh) still resolves.
 *
 * `count` is passed through as a placeholder automatically, since every counted
 * message wants it and forgetting is otherwise a silent `{count}` on screen.
 */
export function translatePlural(
  base: PluralBase,
  count: number,
  args?: Record<string, string | number>,
): string {
  const category: PluralCategory = pluralRules(currentLocale).select(count);
  const messages = currentMessages as Record<string, string | undefined>;
  const template =
    messages[`${base}_${category}`] ??
    messages[`${base}_other`] ??
    (en as Record<string, string | undefined>)[`${base}_${category}`] ??
    (en as Record<string, string | undefined>)[`${base}_other`] ??
    base;
  return interpolate(template, { count, ...args });
}

/** `Intl.NumberFormat` bound to the active locale (decimal separators differ). */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(currentLocale, options).format(value);
}

/**
 * `Intl.ListFormat` bound to the active locale. Joining with `', '` is an
 * English habit — ja uses `、`, and most languages want a conjunction before
 * the last item.
 */
export function formatList(
  items: string[],
  options?: Intl.ListFormatOptions,
): string {
  return new Intl.ListFormat(currentLocale, options).format(items);
}

/**
 * `Intl.ListFormat` split into element and literal parts, so a caller can
 * substitute something richer than a string for each element — an icon plus a
 * coloured label, say — while the locale still supplies the separators and the
 * conjunction.
 */
export function formatListToParts(
  items: string[],
  options?: Intl.ListFormatOptions,
): { type: string; value: string }[] {
  return new Intl.ListFormat(currentLocale, options).formatToParts(items);
}

/**
 * Locale-aware uppercasing. A no-op for the CJK locales, where `toUpperCase`
 * does nothing to the glyphs but mangles any embedded Latin or digits.
 */
export function localeUppercase(text: string): string {
  if (currentLocale === 'ja' || currentLocale === 'ko' || currentLocale.startsWith('zh')) {
    return text;
  }
  return text.toLocaleUpperCase(currentLocale);
}
