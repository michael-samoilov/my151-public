/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { allPickerMons, pickerNameId } from '../../src/favorites/model/catalog';
import { __setNamesForTest, pokemonLabel } from '../../src/i18n/names';
import { setCatalog } from '../../src/i18n/core';
import { en } from '../../src/i18n/catalogs/en';
import { LOCALES } from '../../src/i18n/config';

const catalogs = import.meta.glob<Parameters<typeof __setNamesForTest>[1]>('../../src/i18n/names/*.json', {
  import: 'default', eager: true,
});

describe('generated picker name coverage', () => {
  for (const locale of LOCALES) {
    it(`${locale} resolves every sprite to a localized species instead of a raw name`, () => {
      const catalog = catalogs[`../../src/i18n/names/${locale}.json`];
      __setNamesForTest(locale, catalog);
      setCatalog(locale, en);
      try {
        const missing = allPickerMons().filter(mon => (mon.id === 10227
          ? pokemonLabel(892, mon.name, 'picker:10227')
          : pokemonLabel(pickerNameId(mon), mon.name)).pending);
        expect(missing.map(mon => `${mon.id} ${mon.name}`)).toEqual([]);
      } finally {
        __setNamesForTest(locale, null);
        setCatalog('en', en);
      }
    });
  }
});
