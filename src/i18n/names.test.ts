import { afterEach, describe, expect, it } from 'vitest';
import pokemonData from '@/data/pokemon.json';
import { en } from './catalogs/en';
import { setCatalog } from './core';
import { formLabel, formProvenance, getNamesVersion, speciesName, __setNamesForTest, type NameProvenance } from './names';
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
  formMark: Record<string, string>;
  affix?: string[];
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

  it('uses published game text when PokeAPI omits a descriptor', () => {
    const expected: Record<string, string> = {
      ko: '히스이의 모습',
      'zh-Hant': '洗翠的樣子',
      es: 'Forma de Hisui',
      it: 'Forma di Hisui',
    };
    for (const [locale, label] of Object.entries(expected)) {
      use(locale as Locale);
      expect(formLabel(10229), locale).toBe(label); // Hisuian Growlithe
      expect(formProvenance(10229), locale).toBe('official');
    }
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
});

/**
 * The snapshot `useNamesVersion` hands React.
 *
 * A locale switch changes the names a component would render, and it does not
 * always come with a name catalog download: the target locale's names may be
 * loaded already, or — as `applyLocale` orders things — the download may land
 * *before* the switch that started it. When the snapshot ignored the locale,
 * React was called back with an unchanged value and skipped the re-render, so
 * a gym card showed Japanese type badges under an English name.
 */
describe('getNamesVersion', () => {
  it('changes when the locale changes', () => {
    const before = getNamesVersion();
    setCatalog('ja', en);
    const afterSwitch = getNamesVersion();
    expect(afterSwitch).not.toBe(before);

    setCatalog('en', en);
    expect(getNamesVersion()).not.toBe(afterSwitch);
  });
});
