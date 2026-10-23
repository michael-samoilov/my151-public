import { DEFAULT_LOCALE, type Locale } from './config';
import { en } from './catalogs/en';
import type { ArgsOf, MessageKey, Messages, PluralBase, PluralCategory } from './types';

let currentLocale: Locale = DEFAULT_LOCALE;
let currentMessages: Messages = en;
const subscribers = new Set<() => void>();

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
    Object.prototype.hasOwnProperty.call(args, name) ? String(args[name]) : whole,
  );
}

function lookup(key: string): string {
  const value = (currentMessages as Record<string, string | undefined>)[key];
  if (value !== undefined) return value;
  const fallback = (en as Record<string, string | undefined>)[key];
  if (fallback !== undefined) return fallback;
  return key;
}

export function translate<K extends MessageKey>(key: K, ...args: ArgsOf<K>): string {
  return interpolate(lookup(key), args[0] as Record<string, string | number> | undefined);
}

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

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(currentLocale, options).format(value);
}

export function formatList(
  items: string[],
  options?: Intl.ListFormatOptions,
): string {
  return new Intl.ListFormat(currentLocale, options).format(items);
}

export function formatListToParts(
  items: string[],
  options?: Intl.ListFormatOptions,
): { type: string; value: string }[] {
  return new Intl.ListFormat(currentLocale, options).formatToParts(items);
}

export function localeUppercase(text: string): string {
  if (currentLocale === 'ja' || currentLocale === 'ko' || currentLocale.startsWith('zh')) {
    return text;
  }
  return text.toLocaleUpperCase(currentLocale);
}
