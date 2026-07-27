import { afterEach, describe, expect, it } from 'vitest';
import pokemonData from '@/data/pokemon.json';
import { en } from './catalogs/en';
import { setCatalog } from './core';
import { formLabel, formProvenance, speciesName, __setNamesForTest, type NameProvenance } from './names';
import { normalizeSearch } from './searchNormalize';
import type { Locale } from './config';

/**
 * Goldens for the generated name catalogs.
 *
 * Structural checks can't catch a bad composition rule — every id would still
 * be valid and every string non-empty. These are values a knowledgeable person
 * can state, so a change in the generator has to be defended rather than
 * re-blessed.
 */

const LOCALES = ['en', 'ja', 'ko', 'zh-Hant', 'zh-Hans', 'fr', 'de', 'es', 'it'] as const;

/** Eagerly loaded here so the goldens read the generated files directly,
 *  without going through the lazy loader they are meant to be independent of. */
const CATALOGS = import.meta.glob<NameCatalogFile>('./names/*.json', {
  import: 'default',
  eager: true,
});

interface NameCatalogFile {
  locale: string;
  species: string[];
  forms: Record<string, string>;
  formSource: Record<string, NameProvenance>;
  search?: string[];
}

function load(locale: string) {
  return CATALOGS[`./names/${locale}.json`];
}

function use(locale: Locale) {
  __setNamesForTest(locale, load(locale));
  setCatalog(locale, en);
}

afterEach(() => {
  for (const l of LOCALES) __setNamesForTest(l, null);
  setCatalog('en', en);
});

describe('name catalogs', () => {
  it('names all 1,025 species in every locale', () => {
    for (const locale of LOCALES) {
      const catalog = load(locale);
      const named = catalog.species.filter(Boolean).length;
      expect(named, locale).toBe(1025);
    }
  });

  it('resolves species names through the id map, including alt forms', () => {
    use('ja');
    expect(speciesName(25)).toBe('ピカチュウ'); // Pikachu
    expect(speciesName(10100)).toBe('ライチュウ'); // Alolan Raichu -> Raichu
    // The collision that a naive id join gets wrong: app 10254 is an Alcremie
    // sweet, but upstream id 10254 is Oinkologne.
    expect(speciesName(10254)).toBe('マホイップ'); // Alcremie
    expect(speciesName(10179)).toBe('マッギョ'); // Galarian Stunfisk -> Stunfisk
  });

  it('gives officially published form descriptors where they exist', () => {
    const expected: Record<string, string> = {
      en: 'Alolan Form',
      ja: 'アローラのすがた',
      ko: '알로라의 모습',
      'zh-Hant': '阿羅拉的樣子',
      es: 'Forma de Alola',
      it: 'Forma di Alola',
      de: 'Alola-Form',
    };
    for (const [locale, label] of Object.entries(expected)) {
      use(locale as Locale);
      expect(formLabel(10100), locale).toBe(label);
      expect(formProvenance(10100), locale).toBe('official');
    }
  });

  it('composes the descriptors PokeAPI is missing, from official pieces', () => {
    // Hisuian forms are undocumented in ko/zh/es/it. Each composed value uses
    // that language's own published region name and its own documented pattern,
    // so it matches the shape of the Alolan entry above.
    const expected: Record<string, string> = {
      ko: '히스이의 모습',
      'zh-Hant': '洗翠的樣子',
      es: 'Forma de Hisui',
      it: 'Forma di Hisui',
    };
    for (const [locale, label] of Object.entries(expected)) {
      use(locale as Locale);
      expect(formLabel(10229), locale).toBe(label); // Hisuian Growlithe
      expect(formProvenance(10229), locale).toBe('official-composed');
    }
  });

  it('never composes for a language whose region adjectives are irregular', () => {
    // English would learn "{region}n Form" from "Alolan Form" and render
    // "Galarn Form". The generator validates a learned pattern against every
    // documented form and discards it — English documents all 64 regardless.
    const catalog = load('en');
    const composed = Object.values(catalog.formSource).filter((s) => s === 'official-composed');
    expect(composed).toEqual([]);
    expect(Object.values(load('fr').formSource).filter((s) => s === 'official-composed')).toEqual([]);
  });

  it('has a descriptor for every regional form in every locale', () => {
    // Between official and composed, no regional form should be left unnamed.
    const regional = pokemonData.filter((p) => /-(alola|galar|hisui|paldea)/.test(p.name));
    for (const locale of LOCALES) {
      const catalog = load(locale);
      const missing = regional.filter((p) => !catalog.forms[p.id]).map((p) => p.name);
      expect(missing, locale).toEqual([]);
    }
  });

  it('falls back rather than throwing before a catalog has loaded', () => {
    setCatalog('ko', en);
    expect(speciesName(25)).toBeNull();
    expect(formLabel(10100)).toBeNull();
  });

  it('gives every locale the affixes its keyboard needs', () => {
    // A Japanese user on a Latin keyboard types "pikachu", a Korean user types
    // ㅍㅋㅊ, a Chinese user types pkq. Without these the search box is
    // unusable in exactly the locales the names were added for.
    expect(load('ja').search?.[24]).toBe('ピカチュウ pikachu');
    expect(load('ko').search?.[24]).toBe(normalizeSearch('피카츄 ㅍㅋㅊ'));
    expect(load('zh-Hans').search?.[24]).toBe('皮卡丘 pikaqiu pkq');
    // Latin locales need only the folded name — accents never have to be typed.
    expect(load('fr').search?.[668]).toBe('flabebe');
  });

  it('folds the accents out of every Latin locale it ships', () => {
    for (const locale of ['en', 'fr', 'de', 'es', 'it'] as const) {
      const withAccents = load(locale).search?.filter((text) => /[À-ÿ]/.test(text)) ?? [];
      expect(withAccents, `${locale} left accented text in the search index`).toEqual([]);
    }
  });
});
