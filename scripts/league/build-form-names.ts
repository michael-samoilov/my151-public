import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALTERNATE_PICKER_FORMS } from '../../src/favorites/model/alternateForms';
import league from '../../src/data/generated/league.json';
import powerupForms from '../../src/league/data/powerupForms.json';

const records: { id: number; owner: number }[] = league.forms;
const namesRoot = fileURLToPath(new URL('../../src/i18n/picker-names/', import.meta.url));
const scopedRoot = fileURLToPath(new URL('../../src/league/data/names/', import.meta.url));
const formIds = new Set(records.map(form => String(form.id)));

const powerupKeys = [...new Set([
  ...Object.values(powerupForms as Record<string, Record<string, { id: number }[]>>)
    .flatMap(kinds => Object.values(kinds).flat().map(form => String(form.id))),
  ...ALTERNATE_PICKER_FORMS.filter(form => form.source === 'powerup').map(form => String(form.id)),
  'picker:10227',
])];
const files: [string, string][] = [];
for (const filename of fs.readdirSync(namesRoot).filter(name => name.endsWith('.json'))) {
  const catalog: Record<string, Record<string, unknown>> = JSON.parse(fs.readFileSync(`${namesRoot}/${filename}`, 'utf8'));
  for (const form of records) {
    if (catalog.species[form.id] !== form.owner) throw new Error(`League species mismatch: ${filename}, ${form.id}`);
  }
  const scoped: Record<string, Record<string, unknown>> = Object.fromEntries(['forms', 'formSource', 'formCompact'].map(key => [
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
    throw new Error('League form names are stale. Run npm run league:forms.');
  }
  console.log(`League form names match the picker: ${records.length} forms.`);
} else {
  fs.mkdirSync(scopedRoot, { recursive: true });
  for (const [path, content] of files) fs.writeFileSync(path, content);
  console.log(`Wrote the names of ${records.length} League forms.`);
}
