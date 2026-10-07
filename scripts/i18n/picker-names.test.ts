/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { allPickerMons, pickerNameId } from '../../src/favorites/model/catalog';
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
        const missing = allPickerMons().filter(mon => (mon.id === 10227
          ? pokemonLabel(892, mon.name, 'picker:10227')
          : pokemonLabel(pickerNameId(mon), mon.name)).pending);
        expect(missing.map(mon => `${mon.id} ${mon.name}`)).toEqual([]);
      } finally {
        setCatalog('en', en);
      }
    });
  }
});
