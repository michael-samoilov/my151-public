import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from './config';

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

/** `?lang=` — read-only, matching the app's existing flag convention. */
export function localeFromUrl(search: string): Locale | null {
  try {
    const value = new URLSearchParams(search).get('lang');
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the locale to start in.
 *
 * Precedence: an explicit `?lang=` beats a stored choice, which beats the
 * browser. `stored` is `null` for a user who has never opened the picker —
 * they keep tracking their browser language rather than being pinned to
 * whatever it happened to be on their first visit.
 */
export function resolveLocale(opts: {
  url?: string;
  stored?: Locale | null;
  navigatorLanguages?: readonly string[];
}): Locale {
  const fromUrl = opts.url ? localeFromUrl(opts.url) : null;
  if (fromUrl) return fromUrl;
  if (opts.stored) return opts.stored;
  return negotiateLocale(opts.navigatorLanguages ?? []);
}
