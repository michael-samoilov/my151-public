import { PREVIEW_FEATURES } from '@/lib/demoMode';
import { en } from './catalogs/en';
import { DEFAULT_LOCALE, isLocale, type Locale } from './config';
import { setCatalog } from './core';
import { negotiateLocale } from './detect';
import { loadNames, hasNameExtension } from './names';
import { isPseudoLocale, type PseudoLocale } from './pseudoLocale';
import type { Messages } from './types';

/**
 * Resolving and installing the active catalog.
 *
 * Kept apart from core.ts because this is the only part that knows about the
 * store, the URL and the preview flag; core.ts stays a plain, testable
 * key-to-string lookup.
 */

/** What `?lang=` may name: a real locale, or a pseudo-locale in preview builds. */
export type ActiveLocale = Locale | PseudoLocale;

function langParam(search: string): string | null {
  try {
    return new URLSearchParams(search).get('lang');
  } catch {
    return null;
  }
}

/**
 * Resolve the locale to start in.
 *
 * Precedence is `?lang=` > stored choice > browser. An explicit URL is explicit
 * intent, which is why it outranks a stored preference — it also makes the
 * pseudo-locales and support requests ("open ?lang=de and tell me what you
 * see") work without clearing localStorage first.
 */
export function resolveActiveLocale(opts: {
  search?: string;
  stored?: Locale | null;
  navigatorLanguages?: readonly string[];
}): ActiveLocale {
  const param = opts.search !== undefined ? langParam(opts.search) : null;

  // Pseudo-locales never reach production: they are a development tool, and
  // offering them to a real user would just look broken.
  if (PREVIEW_FEATURES && isPseudoLocale(param)) return param;
  if (isLocale(param)) return param;
  if (opts.stored) return opts.stored;
  return negotiateLocale(opts.navigatorLanguages ?? []);
}

/** Official in-game terminology per locale, generated from PokeAPI. */
const TERM_SOURCES = import.meta.glob<Record<string, string>>('./catalogs/terms/*.json', {
  import: 'default',
});

/**
 * Translated UI strings — the ones with no official source, written for this
 * app. Kept in their own directory rather than merged into the terms so the
 * difference between "this is what the games say" and "this is our wording"
 * survives in the file layout. See `catalogs/ui/README.md`.
 */
const UI_SOURCES = import.meta.glob<Record<string, string>>('./catalogs/ui/*.json', {
  import: 'default',
});

/**
 * Fetch a catalog for a locale.
 *
 * English is bundled and is always the base: every key resolves against it, so
 * a locale that supplies only part of the corpus is a *partial* catalog rather
 * than a broken one. On top of that go the official terms — types, colours, egg
 * groups, regions — which are sourced from PokeAPI rather than translated.
 *
 * The remaining tiers (functional UI, then editorial copy) are layered in as
 * they are produced. Until then a non-English locale shows official
 * terminology and Pokémon names in its own language with English chrome, which
 * is a coherent intermediate state rather than a half-broken one.
 */
export async function loadCatalog(locale: ActiveLocale): Promise<Messages> {
  if (isPseudoLocale(locale)) {
    const { buildPseudoCatalog } = await import('./pseudo');
    return buildPseudoCatalog(locale, en);
  }
  const loadTerms = TERM_SOURCES[`./catalogs/terms/${locale}.json`];
  if (!loadTerms) return en;
  const loadUi = UI_SOURCES[`./catalogs/ui/${locale}.json`];
  // English first, then the sourced terms, then our own wording — so a locale
  // that has translated only part of the corpus is partial rather than broken,
  // and anything untranslated is English rather than missing.
  return {
    ...en,
    ...(await loadTerms()),
    ...(loadUi ? await loadUi() : {}),
  } as Messages;
}

/** The `Locale` a pseudo-locale stands in for, for `<html lang>` and fonts. */
export function baseLocale(locale: ActiveLocale): Locale {
  return isPseudoLocale(locale) ? DEFAULT_LOCALE : locale;
}

/**
 * Install a locale. Awaits both the catalog and the names before committing, so
 * no render can observe the new locale against the old strings.
 *
 * The names used to be fetched without awaiting, on the reasoning that the UI
 * falls back to the app's slug for the frame or two before they land. In
 * practice that frame is long enough to see, and what it shows is every
 * Pokémon's name in lowercase English — `raichu`, `mr-mime` — snapping into the
 * real name a moment later. Against a 151-tile grid that is not a subtle flash.
 *
 * Two chunks in parallel rather than in series: the catalog is small and the
 * names are the larger of the two, so awaiting both together costs about what
 * awaiting the names alone does.
 */
export async function applyLocale(locale: ActiveLocale): Promise<void> {
  const base = baseLocale(locale);
  // Shared pages commit when the UI catalog lands so startup can time out.
  // Picker waits for its optional form names before committing a locale.
  //
  // Awaiting the two as a pair is the obvious way to write this and it is
  // wrong. `initLocale` races this against a timeout so a bad connection
  // cannot hold the first paint open, and the names are the larger chunk — so
  // pairing them means a slow names fetch loses that race and throws away the
  // *language* along with it. The symptom is brutal and silent: a visitor with
  // Japanese stored reloads and gets an entirely English app, `<html lang>` and
  // all. That is far worse than the flash this function exists to prevent.
  const names = loadNames(base);
  const catalog = await loadCatalog(locale);
  if (hasNameExtension()) await names;
  setCatalog(base, catalog);
  // Then wait for the names, so a caller that awaits this — the picker, and
  // boot — does not paint the slug. If they are slow enough to lose the race,
  // the worst case degrades to the old flash rather than to the wrong language.
  await names;
}

/**
 * Resolve and install the startup locale.
 *
 * English is statically bundled, so the common path is synchronous and there is
 * no flash of untranslated content. Anything else is raced against a timeout:
 * a stalled catalog fetch on a flaky connection must degrade to English rather
 * than hold the first paint open indefinitely.
 */
export async function initLocale(opts: {
  search?: string;
  stored?: Locale | null;
  navigatorLanguages?: readonly string[];
  timeoutMs?: number;
}): Promise<void> {
  const locale = resolveActiveLocale(opts);

  const timeout = new Promise<void>((resolve) =>
    setTimeout(resolve, opts.timeoutMs ?? 1200),
  );

  // English's UI catalog is bundled, but its *names* are not, and it needs them
  // as much as any other locale: `Mr. Mime`, `Farfetch'd` and `Nidoran♀` all
  // come from there, and the slug renders them as `mr-mime`, `farfetchd` and
  // `nidoran-f`. This used to return early and skip `applyLocale`, which is
  // what loads them.
  const ready = locale === DEFAULT_LOCALE ? loadNames(DEFAULT_LOCALE) : applyLocale(locale);

  // Shared pages retain the startup timeout. Picker keeps the boot spinner
  // until its complete name catalog is ready, so no raw form slug can paint.
  await (hasNameExtension() ? ready : Promise.race([ready, timeout]));
}
