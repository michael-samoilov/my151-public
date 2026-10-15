import { getLocale, getVersion, subscribe } from './core';
import { DEFAULT_LOCALE, type Locale } from './config';
import altFormSpecies from './alt-form-species.json';
import { normalizeSearch } from './searchNormalize';
import { genderFormOf, GENDER_MARKS } from './genderForms';
import { formatFullPokemonName, pokemonNameContext, type PokemonNameContext } from './fullPokemonName';

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

/**
 * How a form descriptor was arrived at. `english-only` marks a descriptor
 * that no game publishes; see `NameProvenance` in
 * scripts/i18n/build-name-catalogs.ts. Read it through `formProvenance`.
 */
export type NameProvenance = 'official' | 'official-composed' | 'english-only';

interface NameCatalog {
  locale: string;
  /** Dense, indexed by speciesId - 1. */
  species: string[];
  forms: Record<string, string>;
  formSource: Record<string, NameProvenance>;
  /** One-grapheme form marker; see `formMark` in build-name-catalogs.ts. */
  formMark: Record<string, string>;
  /** Protected authored display codes; full descriptors remain separate. */
  formCompact?: Record<string, string>;
  formSearchIndex?: Record<string, string>;
  /**
   * Extra spellings a query might use, beyond the name itself — romaji, jamo
   * initials, pinyin. Absent for the Latin locales. Joined to the folded name
   * once on load; see `buildSearchIndex`.
   */
  affix?: string[];
  /** Built on load from `species` + `affix`. Not present in the JSON. */
  searchIndex?: string[];
}

/**
 * Only alt forms need an appId -> speciesId entry; for the 1,025 base
 * species the two are equal. Importing the full id map instead put ~95 kB of
 * slugs, form ids and notes into the main bundle for nothing.
 *
 * It lives outside `names/` so the lazy glob below can't also match it: a file
 * that is both statically imported and glob-imported is silently pulled into
 * the main chunk, which Rollup warns about and which would defeat the split.
 */
const ALT_FORM_SPECIES = altFormSpecies as Record<string, number>;

const loaded = new Map<Locale, NameCatalog>();
const inFlight = new Map<Locale, Promise<void>>();

/** Vite turns each of these into its own hashed chunk, fetched on demand. */
const SOURCES = import.meta.glob<NameCatalog>('./names/*.json', { import: 'default' });

let extensionLoader: ((locale: Locale, catalog: NameCatalog, species: Record<string, number>) => Promise<void>) | undefined;
/** Picker installs its optional names before boot; other pages never import them. */
export function registerNameExtension(loader: typeof extensionLoader): void {
  extensionLoader = loader;
}
export function hasNameExtension(): boolean { return !!extensionLoader; }

export async function loadNames(locale: Locale): Promise<void> {
  await loadSharedNames(locale);
  const catalog = loaded.get(locale);
  if (extensionLoader && catalog) {
    await extensionLoader(locale, catalog, ALT_FORM_SPECIES);
    buildFormSearchIndex(catalog);
    notify();
  }
}

function loadSharedNames(locale: Locale): Promise<void> {
  if (loaded.has(locale)) return Promise.resolve();
  let pending = inFlight.get(locale);
  if (!pending) {
    const load = SOURCES[`./names/${locale}.json`];
    pending = load
      ? load().then((catalog) => {
          buildSearchIndex(catalog);
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
  namesVersion += 1;
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
 * A value that changes whenever the names a component would render could have
 * changed: a catalog finishing its download, or the locale switching.
 * `useSyncExternalStore` needs an immutable snapshot, so this is a counter
 * rather than the catalog map.
 *
 * Both halves are needed, and the locale half is the one that was missing.
 * The two events are independent: a switch to a locale whose names are
 * already loaded starts no download at all, and a download can land *before*
 * the switch that started it — `applyLocale` begins the names fetch, then
 * awaits the UI catalog, so whichever chunk is smaller arrives first. In that
 * order the download bumped this counter while the locale was still the old
 * one, the switch that followed left the counter alone, and React saw an
 * unchanged snapshot and skipped the re-render. The symptom was a card whose
 * type badges spoke Japanese under a name still reading `Onix`, until
 * something unrelated remounted it.
 *
 * Summing works because neither counter ever goes down, so the total changes
 * exactly when at least one of them does, in whichever order they arrive.
 */
let namesVersion = 0;
export function getNamesVersion(): number {
  return namesVersion + getVersion();
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
 * The tile label, split so the parts can be laid out independently.
 *
 * `name` is the visible name and is the part allowed to truncate. `mark` is the
 * compact form marker and must not: putting it inside the truncating
 * string is what made alt forms indistinguishable on a narrow tile, because the
 * suffix is exactly the part a text overflow eats first. `full` is the whole
 * thing spelled out, for the accessible name and the tooltip.
 *
 * `pending` says the catalog has not landed yet. It is reported rather than
 * papered over because the slug this falls back to is not a translation of
 * anything — it is `mr-mime` and `bulbasaur`, in English, whatever language was
 * asked for. Rendering it is how a Japanese user saw Latin text turn into
 * Japanese a beat later, which reads as the app correcting a mistake.
 *
 * The window is usually a frame or two and is not always: the catalog is
 * fetched after first paint, so a slow connection stretches it to however long
 * the fetch takes. Callers show a placeholder for the duration; `name` stays
 * populated so nothing crashes on it, but it is not for display.
 */
export interface PokemonLabel {
  name: string;
  mark: string | null;
  full: string;
  /** The catalog has not arrived. `name` holds the slug and must not be shown. */
  pending: boolean;
}

/** Complete form names already include their species; descriptors do not. */
function displayPokemonFormName(species: string, descriptor?: string): string {
  if (!descriptor) return species;
  const name = species.normalize('NFKC').toLocaleLowerCase();
  const form = descriptor.normalize('NFKC').toLocaleLowerCase();
  let index = form.indexOf(name);
  while (index !== -1) {
    // Latin names need word boundaries: Mew is not the species in Mewtwo.
    // Japanese, Korean and Chinese complete names join the prefix directly.
    const latin = /\p{Script=Latin}/u.test(name);
    const before = form[index - 1] ?? '';
    const after = form[index + name.length] ?? '';
    const joinedPrefix = /^(mega|ultra)$/.test(form.slice(0, index));
    if (!latin || ((!/[\p{L}\p{N}]/u.test(before) || joinedPrefix) && !/[\p{L}\p{N}]/u.test(after))) return descriptor;
    index = form.indexOf(name, index + name.length);
  }
  return `${species} — ${descriptor}`;
}

export function fullPokemonName(species: string, descriptor?: string, context: Partial<PokemonNameContext> = {}): string {
  return formatFullPokemonName(species, descriptor, { ...context, locale: context.locale ?? getLocale() });
}

export function pokemonLabel(appId: number, slug: string, formKey: number | `picker:${number}` = appId): PokemonLabel {
  const catalog = loaded.get(getLocale());
  const species = speciesName(appId);
  if (!catalog || !species) return { name: slug, mark: null, full: slug, pending: true };
  const compact = catalog.formCompact?.[formKey];
  let mark: string | null = compact ?? catalog.formMark[appId] ?? null;
  const descriptor = catalog.forms[formKey];
  const context = pokemonNameContext(appId, slug, catalog.forms, getLocale());
  const gender = genderFormOf(appId, slug);
  if (gender) {
    mark = [compact?.replace(/[♂♀]/gu, '').trim(), GENDER_MARKS[gender]].filter(Boolean).join(' ');
    const name = species.replace(/[♂♀]$/u, '');
    const qualifier = catalog.forms[gender === 'male' ? 678 : 10025] ?? mark;
    const formName = descriptor && descriptor !== qualifier && descriptor !== mark
      ? displayPokemonFormName(name, descriptor) : name;
    const full = fullPokemonName(name, descriptor, context);
    return { name: compact ? name : formName, mark, full, pending: false };
  }
  // The three Paldean Tauros share one region mark, so the tile names the
  // breed: the part of the game's form name after "Paldean Form" —
  // "Paldea-Form (Gefechtvariante)", "パルデアのすがた・コンバットしゅ",
  // "팔데아의 모습/컴뱃종" (Pokémon Champions' zkn_form_syn table).
  const isBreed = appId === 10250 || appId === 10251 || appId === 10252;
  const breed = isBreed ? descriptor?.match(/[(（]([^()（）]+)[)）]$|[・/]([^・/]+)$/u) : null;
  const breedQualifier = breed?.[1] ?? breed?.[2];
  const displayFull = displayPokemonFormName(species, descriptor);
  const full = fullPokemonName(species, descriptor, context);
  let name = compact ? species : isBreed ? breedQualifier ? `${species} (${breedQualifier})` : displayFull
    : !mark && (appId > 1025 || formKey !== appId) ? displayFull : species;
  // X/Y are part of the official name. Reserve the final glyph just like a
  // regional mark so an ellipsis never makes the two Mega forms identical.
  if (!compact && [10034, 10035, 10043, 10044, 10304, 10305].includes(appId)) {
    const variant = displayFull.match(/[XYＸＹ]$/u)?.[0];
    if (variant) { mark = variant; name = displayFull.slice(0, -variant.length).trimEnd(); }
  }
  return {
    // Named alternate forms need their full name when no compact marker
    // distinguishes them. Base/default species keep their existing label.
    name,
    mark,
    full,
    pending: false,
  };
}

/**
 * Alt text for a sprite drawn without its name beside it.
 *
 * English keeps the text these images have always carried, often a slug
 * (`mr-mime`), because specs and the English accessibility tree read it.
 * Every other locale gets the first of `appIds` that its name catalog knows,
 * so a screen reader does not spell out an English id. A power-up form that
 * the catalog does not name passes its base species as the next id. Empty
 * while the catalog loads, which marks the image as decorative for that
 * moment rather than reading out English.
 */
export function spriteAlt(english: string, ...appIds: number[]): string {
  if (getLocale() === DEFAULT_LOCALE) return english;
  for (const appId of appIds) {
    const label = pokemonLabel(appId, english);
    if (!label.pending) return label.full;
  }
  return '';
}

/**
 * Where a form descriptor came from. `official-composed` means it was rebuilt
 * from the region's published name plus a pattern learned from another form in
 * the same language — accurate, but not something the publisher printed.
 * `english-only` means no game publishes the descriptor in any language. No UI
 * marker reads this value yet.
 */
export function formProvenance(appId: number): NameProvenance | null {
  const catalog = loaded.get(getLocale());
  return catalog?.formSource[appId] ?? null;
}

/**
 * Fold every name once and join its extra spellings to it.
 *
 * Done on load rather than shipped, because the alternative is storing a
 * derived copy of all 1,025 names beside the names — a copy that can drift, for
 * ~3.5 kB gzipped per locale. Done on load rather than per keystroke, because
 * the search filter calls `speciesSearchText` once per Pokémon per character
 * typed, and normalizing 1,025 names on every keypress is not free.
 */
function buildSearchIndex(catalog: NameCatalog): void {
  buildFormSearchIndex(catalog);
  catalog.searchIndex = catalog.species.map((name, i) => {
    if (!name) return '';
    const folded = normalizeSearch(name);
    const affix = catalog.affix?.[i];
    return affix ? `${folded} ${affix}` : folded;
  });
}

/**
 * Everything a query might match for this species in the active locale: the
 * folded name, plus Hepburn romaji in Japanese, jamo initials in Korean and
 * pinyin (with initials) in Chinese.
 *
 * `null` until the locale's catalog has loaded, which the caller treats as
 * "match the English slug only" — the behaviour the app has always had.
 */
export function speciesSearchText(appId: number): string | null {
  const catalog = loaded.get(getLocale());
  return catalog?.searchIndex?.[speciesIndex(appId)] || null;
}

function buildFormSearchIndex(catalog: NameCatalog): void {
  catalog.formSearchIndex = Object.fromEntries(Object.entries(catalog.forms).map(([key, descriptor]) => {
    const id = Number(key);
    const species = catalog.species[speciesIndex(id)] ?? '';
    return [key, normalizeSearch(`${species} ${descriptor}`).replace(/[^\p{L}\p{N}♂♀]+/gu, ' ')];
  }));
  const genderCandidates = new Set([...catalog.species.keys()].map(index => index + 1));
  for (const key of Object.keys(catalog.forms)) if (Number.isFinite(Number(key))) genderCandidates.add(Number(key));
  for (const id of genderCandidates) {
    const gender = genderFormOf(id, '');
    if (!gender || id === 29 || id === 32) continue;
    const descriptor = catalog.forms[gender === 'male' ? 678 : 10025] ?? GENDER_MARKS[gender];
    catalog.formSearchIndex[id] = normalizeSearch(`${catalog.species[speciesIndex(id)]} ${catalog.forms[id] ?? ''} ${descriptor}`);
  }
}

export function formSearchText(appId: number): string | null {
  return loaded.get(getLocale())?.formSearchIndex?.[appId] ?? null;
}

/** Test seam: install a catalog without going through the lazy loader. */
export function __setNamesForTest(locale: Locale, catalog: NameCatalog | null): void {
  if (catalog) {
    buildSearchIndex(catalog);
    loaded.set(locale, catalog);
  }
  else loaded.delete(locale);
}
