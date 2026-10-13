import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALTERNATE_PICKER_FORMS } from '../../src/favorites/model/alternateForms';
import metadata from '../../src/favorites/data/formMetadata.json';
import { isLeagueAlternateForm } from '../../src/league/data/formPolicy';
import powerupForms from '../../src/league/data/powerupForms.json';

const destination = fileURLToPath(new URL('../../src/league/data/alternateForms.json', import.meta.url));
const formMetadata: Record<string, unknown> = metadata;
const records = ALTERNATE_PICKER_FORMS.filter(isLeagueAlternateForm).map(form => ({
  id: form.id,
  ownerId: form.ownerId,
  name: form.name,
  types: form.types,
  ...(form.generation === undefined ? {} : { generation: form.generation }),
  ...(formMetadata[form.id] ? { metadata: formMetadata[form.id] } : {}),
}));
const output = `${JSON.stringify(records, null, 2)}\n`;
const namesRoot = fileURLToPath(new URL('../../src/i18n/picker-names/', import.meta.url));
const scopedRoot = fileURLToPath(new URL('../../src/league/data/names/', import.meta.url));
const formIds = new Set(records.map(form => String(form.id)));
// The card names its Mega, Primal, and Gigantamax forms as the picker does, so
// the subset carries their descriptors too: every harvested powerup form, the
// picker-only Mega variants, and Gigantamax Rapid Strike Urshifu, whose name
// sits under `picker:10227` because 10227 is Rapid Strike Urshifu itself.
const powerupKeys = [...new Set([
  ...Object.values(powerupForms as Record<string, Record<string, { id: number }[]>>)
    .flatMap(kinds => Object.values(kinds).flat().map(form => String(form.id))),
  ...ALTERNATE_PICKER_FORMS.filter(form => form.source === 'powerup').map(form => String(form.id)),
  'picker:10227',
])];
const files = [[destination, output]];
for (const filename of fs.readdirSync(namesRoot).filter(name => name.endsWith('.json'))) {
  const catalog: Record<string, Record<string, unknown>> = JSON.parse(fs.readFileSync(`${namesRoot}/${filename}`, 'utf8'));
  for (const form of records) {
    if (catalog.species[form.id] !== form.ownerId) throw new Error(`League species mismatch: ${filename}, ${form.id}`);
  }
  const scoped: Record<string, Record<string, unknown>> = Object.fromEntries(['forms', 'formSource', 'formCompact'].map(key => [
    // A powerup form needs only its descriptor: the card uses its full name.
    key, Object.fromEntries(Object.entries(catalog[key]).filter(([id]) => formIds.has(id) || (key === 'forms' && powerupKeys.includes(id)))),
  ]));
  scoped.powerupSpecies = Object.fromEntries(powerupKeys.map(id => {
    const species = id === 'picker:10227' ? 892 : catalog.species[id];
    if (typeof species !== 'number' || !catalog.forms[id]) throw new Error(`League powerup name missing: ${filename}, ${id}`);
    return [id, species];
  }));
  files.push([`${scopedRoot}/${filename}`, `${JSON.stringify(scoped, null, 2)}\n`]);
}
if (process.argv.includes('--check')) {
  if (files.some(([path, content]) => !fs.existsSync(path) || fs.readFileSync(path, 'utf8') !== content)) {
    throw new Error('League forms are stale. Run npm run league:forms.');
  }
  console.log(`League forms match the picker: ${records.length} identities.`);
} else {
  fs.mkdirSync(scopedRoot, { recursive: true });
  for (const [path, content] of files) fs.writeFileSync(path, content);
  console.log(`Wrote ${records.length} League form identities.`);
}
