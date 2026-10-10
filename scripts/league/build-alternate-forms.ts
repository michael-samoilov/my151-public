import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALTERNATE_PICKER_FORMS } from '../../src/favorites/model/alternateForms';
import metadata from '../../src/favorites/data/formMetadata.json';
import { isLeagueAlternateForm } from '../../src/league/data/formPolicy';

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
if (process.argv.includes('--check')) {
  if (fs.readFileSync(destination, 'utf8') !== output) {
    throw new Error('League forms are stale. Run npm run league:forms.');
  }
  console.log(`League forms match the picker: ${records.length} identities.`);
} else {
  fs.writeFileSync(destination, output);
  console.log(`Wrote ${records.length} League form identities.`);
}
