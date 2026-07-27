import { getLocale, subscribe } from './core';
import { DEFAULT_LOCALE, type Locale } from './config';
import altFormSpecies from './names/alt-form-species.json';

/**
 * Localized Pokémon names.
 *
 * Kept apart from the message catalog because the shape and the economics are
 * different: ~1,025 names per locale is far more than the whole UI corpus, it
 * is sourced rather than translated, and it is only needed once a locale is
 * actually selected. So these load lazily, and the UI reads through a
 * synchronous accessor that falls back to English until they arrive — names
 * appearing a frame late is imperceptible, whereas blocking first paint on
 * them would not be.
 */

/** How a form descriptor was arrived at. Drives the "not official" marker. */
export type NameProvenance = 'official' | 'official-composed';

interface NameCatalog {
  locale: string;
  /** Dense, indexed by speciesId - 1. */
  species: string[];
  forms: Record<string, string>;
  formSource: Record<string, NameProvenance>;
  romaji?: string[];
}

/**
 * Only the 64 alt forms need an appId -> speciesId entry; for the 1,025 base
 * species the two are equal. Importing the full id map instead put ~95 kB of
 * slugs, form ids and notes into the main bundle for nothing.
 */
const ALT_FORM_SPECIES = altFormSpecies as Record<string, number>;

const loaded = new Map<Locale, NameCatalog>();
const inFlight = new Map<Locale, Promise<void>>();

/** Vite turns each of these into its own hashed chunk, fetched on demand. */
const SOURCES = import.meta.glob<NameCatalog>('./names/*.json', { import: 'default' });

export function loadNames(locale: Locale): Promise<void> {
  if (loaded.has(locale)) return Promise.resolve();
  let pending = inFlight.get(locale);
  if (!pending) {
    const load = SOURCES[`./names/${locale}.json`];
    pending = load
      ? load().then((catalog) => {
          loaded.set(locale, catalog);
          inFlight.delete(locale);
          notify();
        })
      : Promise.resolve();
    inFlight.set(locale, pending);
  }
  return pending;
}

// Names arrive after the locale does, so anything already rendered needs a
// nudge. Piggybacks on the catalog store's subscriber list rather than adding
// a second notification channel.
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((cb) => cb());
}
export function subscribeNames(cb: () => void): () => void {
  const off = subscribe(cb);
  listeners.add(cb);
  return () => {
    off();
    listeners.delete(cb);
  };
}

/**
 * The species name in the active locale, or `null` if that locale's catalog
 * isn't loaded. Callers fall back to the English slug, which is what the app
 * has always shown.
 */
export function speciesName(appId: number): string | null {
  const locale = getLocale();
  if (locale === DEFAULT_LOCALE) return loaded.get(locale)?.species[speciesIndex(appId)] ?? null;
  const catalog = loaded.get(locale);
  if (!catalog) return null;
  return catalog.species[speciesIndex(appId)] || null;
}

function speciesIndex(appId: number): number {
  return (ALT_FORM_SPECIES[appId] ?? appId) - 1;
}

/**
 * The form descriptor — "Alolan Form", "アローラのすがた" — for an alt form, or
 * `null` for a base species and for any form this locale has no wording for.
 */
export function formLabel(appId: number): string | null {
  const catalog = loaded.get(getLocale());
  return catalog?.forms[appId] ?? null;
}

/**
 * Where a form descriptor came from. `official-composed` means it was rebuilt
 * from the region's published name plus a pattern learned from another form in
 * the same language — accurate, but not something the publisher printed, so the
 * UI marks it.
 */
export function formProvenance(appId: number): NameProvenance | null {
  const catalog = loaded.get(getLocale());
  return catalog?.formSource[appId] ?? null;
}

/** Hepburn romaji for the search index. Japanese only, empty elsewhere. */
export function speciesRomaji(appId: number): string | null {
  const catalog = loaded.get(getLocale());
  return catalog?.romaji?.[speciesIndex(appId)] || null;
}

/** Test seam: install a catalog without going through the lazy loader. */
export function __setNamesForTest(locale: Locale, catalog: NameCatalog | null): void {
  if (catalog) loaded.set(locale, catalog);
  else loaded.delete(locale);
}
