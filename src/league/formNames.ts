import { registerNameExtension, type NameProvenance } from '@/i18n/names';
import type { Locale } from '@/i18n/config';
import { LEAGUE_ALTERNATE_FORMS } from './data/catalog';

interface FormNames {
  forms: Record<string, string>;
  formSource: Record<string, NameProvenance>;
}

const sources = import.meta.glob<FormNames>('./data/names/*.json', { import: 'default' });
const loaded = new Map<Locale, Promise<FormNames>>();

function loadFormNames(locale: Locale): Promise<FormNames> {
  let pending = loaded.get(locale);
  if (!pending) {
    pending = sources[`./data/names/${locale}.json`]();
    loaded.set(locale, pending);
  }
  return pending;
}

registerNameExtension(async (locale, catalog, species) => {
  const names = await loadFormNames(locale);
  const missingDescriptor = LEAGUE_ALTERNATE_FORMS.some(form => !names.forms[form.id] && !form.name.endsWith('-female'));
  const fallback = missingDescriptor && locale !== 'en' ? await loadFormNames('en') : names;
  for (const form of LEAGUE_ALTERNATE_FORMS) {
    const id = form.id;
    species[id] = form.ownerId;
    const female = form.name.endsWith('-female');
    const descriptor = names.forms[id] ?? (female ? '♀' : fallback.forms[id]);
    if (descriptor) {
      catalog.forms[id] = descriptor;
      catalog.formSource[id] = names.forms[id] ? names.formSource[id] ?? 'official-composed' : 'official-composed';
    }
  }
});
