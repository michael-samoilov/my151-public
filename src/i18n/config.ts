export const LOCALES = [
  'en',
  'ja',
  'ko',
  'zh-Hans',
  'zh-Hant',
  'fr',
  'de',
  'es',
  'it',
] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

interface LocaleMeta {
  endonym: string;
  tag: string;
  /** PokeAPI `languages.csv` id, used by the name-catalog generator.
   *  Japanese uses 1 (ja-Hrkt) rather than 11 (kanji): it is what the games
   *  display, and 11 has gaps in egg groups and stat names. */
  pokeapiId: number;
  dir: 'ltr' | 'rtl';
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  en: { endonym: 'English', tag: 'en', pokeapiId: 9, dir: 'ltr' },
  ja: { endonym: '日本語', tag: 'ja', pokeapiId: 1, dir: 'ltr' },
  ko: { endonym: '한국어', tag: 'ko', pokeapiId: 3, dir: 'ltr' },
  'zh-Hans': { endonym: '简体中文', tag: 'zh-Hans', pokeapiId: 12, dir: 'ltr' },
  'zh-Hant': { endonym: '繁體中文', tag: 'zh-Hant', pokeapiId: 4, dir: 'ltr' },
  fr: { endonym: 'Français', tag: 'fr', pokeapiId: 5, dir: 'ltr' },
  de: { endonym: 'Deutsch', tag: 'de', pokeapiId: 6, dir: 'ltr' },
  es: { endonym: 'Español', tag: 'es', pokeapiId: 7, dir: 'ltr' },
  it: { endonym: 'Italiano', tag: 'it', pokeapiId: 8, dir: 'ltr' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function htmlLang(locale: Locale): string {
  return LOCALE_META[locale].tag;
}

export function direction(locale: Locale): 'ltr' | 'rtl' {
  return LOCALE_META[locale].dir;
}
