import { readFileSync, writeFileSync } from 'node:fs';
import { allPickerMons } from '../../src/favorites/model/catalog';
import { LOCALES } from '../../src/i18n/config';

const species = JSON.parse(readFileSync('src/i18n/alt-form-species.json', 'utf8')) as Record<number, number>;
const report = LOCALES.map(locale => {
  const catalog = JSON.parse(readFileSync(`src/i18n/names/${locale}.json`, 'utf8')) as {
    species: string[]; forms: Record<string, string>;
  };
  const overlay = JSON.parse(readFileSync(`src/i18n/picker-names/${locale}.json`, 'utf8'));
  Object.assign(catalog.forms, overlay.forms);
  Object.assign(species, overlay.species);
  const missingSpecies = allPickerMons().filter(mon => !catalog.species[(species[mon.id] ?? mon.id) - 1]);
  const missingDescriptors = allPickerMons().filter(mon => mon.id > 10_000
    && !catalog.forms[mon.id]
    && !mon.name.endsWith('-female')).map(mon => ({ id: mon.id, name: mon.name }));
  return { locale, sprites: allPickerMons().length, missingSpecies, missingDescriptors };
});
writeFileSync('docs/evidence/picker-names/coverage.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(report.map(row => ({ locale: row.locale, sprites: row.sprites, missingSpecies: row.missingSpecies.length, missingDescriptors: row.missingDescriptors })));
