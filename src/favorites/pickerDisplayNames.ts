import englishNames from '@/i18n/names/en.json';
import englishForms from '@/i18n/picker-names/en.json';
import altFormSpecies from '@/i18n/alt-form-species.json';
import { pickerFullName, type PickerNameTables } from './pickerFullName';
import type { PickerMon } from './model/catalog';

// Only the picker bundles this canonical fallback. Other pages keep lazy names.
const ENGLISH: PickerNameTables = {
  locale: 'en',
  species: englishNames.species,
  speciesIds: { ...altFormSpecies, ...englishForms.species },
  descriptors: { ...englishNames.forms, ...englishForms.forms },
};

/** Friendly English names while the selected locale's catalog is in flight. */
export function englishPickerName(mon: PickerMon): string {
  return pickerFullName(mon, ENGLISH);
}
