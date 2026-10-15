import { registerNameExtension } from '../i18n/names';
import type { Locale } from '../i18n/config';
import type { NameProvenance } from '../i18n/names';
import englishForms from '../i18n/picker-names/en.json';

interface PickerNames {
  species: Record<string, number>;
  forms: Record<string, string>;
  formSource: Record<string, NameProvenance>;
  formCompact?: Record<string,string>;
}
const sources = import.meta.glob<PickerNames>(['../i18n/picker-names/*.json', '!../i18n/picker-names/en.json'], { import: 'default' });
const loaded = new Map<Locale, Promise<PickerNames>>();
function loadPickerNames(locale: Locale): Promise<PickerNames> {
  let pending = loaded.get(locale);
  if (!pending) {
    pending = locale === 'en'
      ? Promise.resolve(englishForms as PickerNames)
      : sources[`../i18n/picker-names/${locale}.json`]();
    loaded.set(locale, pending);
  }
  return pending;
}
registerNameExtension(async (locale, catalog, species) => {
  const overlay = await loadPickerNames(locale);
  Object.assign(catalog.forms, overlay.forms);
  catalog.formCompact = { ...catalog.formCompact, ...overlay.formCompact };
  Object.assign(catalog.formSource, overlay.formSource);
  Object.assign(species, overlay.species);
}, async locale => { await loadPickerNames(locale); });
