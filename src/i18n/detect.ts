import { DEFAULT_LOCALE, LOCALES, type Locale } from './config';

/**
 * Map one BCP 47 tag from the browser onto a supported locale.
 *
 * Chinese needs explicit handling: the app ships two *scripts*, but browsers
 * mostly report *regions*. Taiwan, Hong Kong and Macau use Traditional;
 * the mainland and Singapore use Simplified; a bare `zh` is Simplified by
 * convention. Falling back on the primary subtag alone would send every
 * Traditional reader to the Simplified catalog.
 */
export function matchLocale(tag: string): Locale | null {
  const lower = tag.toLowerCase();

  if (lower.startsWith('zh')) {
    if (/\b(hant|tw|hk|mo)\b/.test(lower.replace(/-/g, ' '))) return 'zh-Hant';
    return 'zh-Hans';
  }

  // Exact match first (`pt-BR` must not win on `pt`).
  const exact = LOCALES.find((l) => l.toLowerCase() === lower);
  if (exact) return exact;

  const primary = lower.split('-')[0];
  const byPrimary = LOCALES.find((l) => l.toLowerCase().split('-')[0] === primary);
  return byPrimary ?? null;
}

/**
 * Pick a locale from the browser's ordered preference list, honouring the order
 * the user set rather than the order we happen to declare our locales in.
 */
export function negotiateLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const match = matchLocale(tag);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

