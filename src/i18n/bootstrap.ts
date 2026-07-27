import { PREVIEW_FEATURES } from '@/lib/demoMode';
import { en } from './catalogs/en';
import { DEFAULT_LOCALE, isLocale, type Locale } from './config';
import { setCatalog } from './core';
import { negotiateLocale } from './detect';
import { loadNames } from './names';
import { buildPseudoCatalog, isPseudoLocale, type PseudoLocale } from './pseudo';
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

/**
 * Fetch a catalog. English is bundled; the pseudo-locales are generated from it.
 *
 * The eight real translated catalogs do not exist yet — they are generated and
 * adjudicated in a later phase — so every other locale currently resolves to
 * English. That is deliberate rather than a gap: the runtime, the store field
 * and the layout harness all need to be in place and proven first, and English
 * is a correct (if untranslated) answer in the meantime.
 */
export async function loadCatalog(locale: ActiveLocale): Promise<Messages> {
  if (isPseudoLocale(locale)) return buildPseudoCatalog(locale);
  return en;
}

/** The `Locale` a pseudo-locale stands in for, for `<html lang>` and fonts. */
export function baseLocale(locale: ActiveLocale): Locale {
  return isPseudoLocale(locale) ? DEFAULT_LOCALE : locale;
}

/**
 * Install a locale. Awaits the catalog before committing so no render can
 * observe the new locale against the old strings.
 */
export async function applyLocale(locale: ActiveLocale): Promise<void> {
  setCatalog(baseLocale(locale), await loadCatalog(locale));
  // Names are a separate, larger chunk and are deliberately not awaited: the
  // UI falls back to the English slug until they arrive, which is a frame or
  // two, whereas blocking the locale switch on ~1,025 names would be visible.
  void loadNames(baseLocale(locale));
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
  if (locale === DEFAULT_LOCALE) return;

  const timeout = new Promise<void>((resolve) =>
    setTimeout(resolve, opts.timeoutMs ?? 1200),
  );
  await Promise.race([applyLocale(locale), timeout]);
}
