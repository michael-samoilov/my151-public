import { getLocale, getVersion, subscribe } from './core';
import { DEFAULT_LOCALE, type Locale } from './config';
import altFormSpecies from './alt-form-species.json';
import { normalizeSearch } from './searchNormalize';
import { genderFormOf, GENDER_MARKS } from './genderForms';
import { formatFullPokemonName, pokemonNameContext, type PokemonNameContext } from './fullPokemonName';

export type NameProvenance = 'official' | 'official-composed' | 'official-bulbapedia' | 'english-only';

interface NameCatalog {
  locale: string;
  species: string[];
  forms: Record<string, string>;
  formSource: Record<string, NameProvenance>;
  formMark: Record<string, string>;
  formCompact?: Record<string, string>;
  formSearchIndex?: Record<string, string>;
  affix?: string[];
  searchIndex?: string[];
}

const ALT_FORM_SPECIES = altFormSpecies as Record<string, number>;

const loaded = new Map<Locale, NameCatalog>();
const inFlight = new Map<Locale, Promise<void>>();

const SOURCES = import.meta.glob<NameCatalog>('./names/*.json', { import: 'default' });

let extensionLoader: ((locale: Locale, catalog: NameCatalog, species: Record<string, number>) => Promise<void>) | undefined;
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

let namesVersion = 0;
export function getNamesVersion(): number {
  return namesVersion + getVersion();
}

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

export function formLabel(appId: number): string | null {
  const catalog = loaded.get(getLocale());
  return catalog?.forms[appId] ?? null;
}

export interface PokemonLabel {
  name: string;
  mark: string | null;
  full: string;
  pending: boolean;
}

function displayPokemonFormName(species: string, descriptor?: string): string {
  if (!descriptor) return species;
  const name = species.normalize('NFKC').toLocaleLowerCase();
  const form = descriptor.normalize('NFKC').toLocaleLowerCase();
  let index = form.indexOf(name);
  while (index !== -1) {
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
  const isBreed = appId === 10250 || appId === 10251 || appId === 10252;
  const breed = isBreed ? descriptor?.match(/[(（]([^()（）]+)[)）]$|[・/]([^・/]+)$/u) : null;
  const breedQualifier = breed?.[1] ?? breed?.[2];
  const displayFull = displayPokemonFormName(species, descriptor);
  const full = fullPokemonName(species, descriptor, context);
  let name = compact ? species : isBreed ? breedQualifier ? `${species} (${breedQualifier})` : displayFull
    : !mark && (appId > 1025 || formKey !== appId) ? displayFull : species;
  if (!compact && [10034, 10035, 10043, 10044, 10304, 10305].includes(appId)) {
    const variant = displayFull.match(/[XYＸＹ]$/u)?.[0];
    if (variant) { mark = variant; name = displayFull.slice(0, -variant.length).trimEnd(); }
  }
  return {
    name,
    mark,
    full,
    pending: false,
  };
}

export function spriteAlt(english: string, ...appIds: number[]): string {
  if (getLocale() === DEFAULT_LOCALE) return english;
  for (const appId of appIds) {
    const label = pokemonLabel(appId, english);
    if (!label.pending) return label.full;
  }
  return '';
}

export function formProvenance(appId: number): NameProvenance | null {
  const catalog = loaded.get(getLocale());
  return catalog?.formSource[appId] ?? null;
}

function buildSearchIndex(catalog: NameCatalog): void {
  buildFormSearchIndex(catalog);
  catalog.searchIndex = catalog.species.map((name, i) => {
    if (!name) return '';
    const folded = normalizeSearch(name);
    const affix = catalog.affix?.[i];
    return affix ? `${folded} ${affix}` : folded;
  });
}

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

export function __setNamesForTest(locale: Locale, catalog: NameCatalog | null): void {
  if (catalog) {
    buildSearchIndex(catalog);
    loaded.set(locale, catalog);
  }
  else loaded.delete(locale);
}
