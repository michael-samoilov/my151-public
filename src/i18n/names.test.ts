import { afterEach, describe, expect, it } from 'vitest';
import pokemonData from '@/data/pokemon.json';
import { en } from './catalogs/en';
import { setCatalog } from './core';
import { formLabel, formProvenance, getNamesVersion, speciesName, __setNamesForTest, type NameProvenance } from './names';
import type { Locale } from './config';

const LOCALES = ['en', 'ja', 'ko', 'zh-Hant', 'zh-Hans', 'fr', 'de', 'es', 'it'] as const;

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
    expect(speciesName(25)).toBe('ピカチュウ');
    expect(speciesName(10100)).toBe('ライチュウ');
    expect(speciesName(10254)).toBe('マホイップ');
    expect(speciesName(10179)).toBe('マッギョ');
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
      expect(formLabel(10229), locale).toBe(label);
      expect(formProvenance(10229), locale).toBe('official');
    }
  });

  it('has a descriptor for every regional form in every locale', () => {
    const regional = pokemonData.filter((p) => /-(alola|galar|hisui|paldea)/.test(p.name));
    for (const locale of LOCALES) {
      const catalog = load(locale);
      const missing = regional.filter((p) => !catalog.forms[p.id]).map((p) => p.name);
      expect(missing, locale).toEqual([]);
    }
  });
});

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
