import { registerNameExtension } from '../i18n/names';
import type { Locale } from '../i18n/config';
import type { NameProvenance } from '../i18n/names';

interface PickerNames {
  species: Record<string, number>;
  forms: Record<string, string>;
  formSource: Record<string, NameProvenance>;
}
const sources = import.meta.glob<PickerNames>('../i18n/picker-names/*.json', { import: 'default' });
const loaded = new Map<Locale, Promise<PickerNames>>();
registerNameExtension(async (locale, catalog, species) => {
  let pending = loaded.get(locale);
  if (!pending) {
    pending = sources[`../i18n/picker-names/${locale}.json`]();
    loaded.set(locale, pending);
  }
  const overlay = await pending;
  Object.assign(catalog.forms, overlay.forms);
  Object.assign(catalog.formSource, overlay.formSource);
  Object.assign(species, overlay.species);
});
