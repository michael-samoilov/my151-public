import { DEFAULT_LOCALE, LOCALES, type Locale } from './config';

export function matchLocale(tag: string): Locale | null {
  const lower = tag.toLowerCase();

  if (lower.startsWith('zh')) {
    if (/\b(hant|tw|hk|mo)\b/.test(lower.replace(/-/g, ' '))) return 'zh-Hant';
    return 'zh-Hans';
  }

  const exact = LOCALES.find((l) => l.toLowerCase() === lower);
  if (exact) return exact;

  const primary = lower.split('-')[0];
  const byPrimary = LOCALES.find((l) => l.toLowerCase().split('-')[0] === primary);
  return byPrimary ?? null;
}

export function negotiateLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const match = matchLocale(tag);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

