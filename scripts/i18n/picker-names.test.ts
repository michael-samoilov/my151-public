/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { allPickerMons } from '../../src/favorites/model/catalog';
import '../../src/favorites/pickerNames';
import { loadNames, pokemonLabel } from '../../src/i18n/names';
import { setCatalog } from '../../src/i18n/core';
import { en } from '../../src/i18n/catalogs/en';
import { LOCALES } from '../../src/i18n/config';

describe('generated picker name coverage', () => {
  for (const locale of LOCALES) {
    it(`${locale} resolves every sprite to a localized species instead of a raw name`, async () => {
      await loadNames(locale);
      setCatalog(locale, en);
      try {
        const missing = allPickerMons().filter(mon => pokemonLabel(mon.id, mon.name).pending);
        expect(missing.map(mon => `${mon.id} ${mon.name}`)).toEqual([]);
      } finally {
        setCatalog('en', en);
      }
    });
  }
});
