/** Refresh sourced battle-form types. This manual task is never part of a build. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const revision = process.argv[2] ?? 'bc92d3b6029ef1abe9e7ad424c400b338f3c11fe';
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Pass an immutable PokeAPI commit SHA.');
const forms = JSON.parse(await readFile(new URL('src/league/data/powerupForms.json', root), 'utf8'));
const expected = Object.entries(forms).flatMap(([owner, kinds]) => Object.values(kinds).flat().map(form => ({ ...form, owner: Number(owner) })));
expected.push({ id: 10227, owner: 892, label: 'Gigantamax Urshifu Rapid Strike' });
const tables = await Promise.all(['pokemon', 'pokemon_types', 'types'].map(async name => {
  const url = `https://raw.githubusercontent.com/PokeAPI/pokeapi/${revision}/data/v2/csv/${name}.csv`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const csv = await response.text();
  const [header, ...lines] = csv.trim().split('\n');
  const keys = header.split(',');
  return { name, url, sha256: createHash('sha256').update(csv).digest('hex'), rows: lines.map(line => Object.fromEntries(line.split(',').map((value, i) => [keys[i], value]))) };
}));
const pokemon = new Map(tables[0].rows.map(row => [Number(row.id), row]));
const types = new Map(tables[2].rows.map(row => [row.id, row.identifier]));
const output = {};
const inventory = [];
for (const form of expected.sort((a, b) => a.id - b.id)) {
  const row = pokemon.get(form.id);
  if (!row || Number(row.species_id) !== form.owner) throw new Error(`Missing or mismatched form ${form.id}.`);
  const formTypes = tables[1].rows.filter(type => Number(type.pokemon_id) === form.id).sort((a, b) => Number(a.slot) - Number(b.slot)).map(type => types.get(type.type_id));
  if (!formTypes.length || formTypes.some(type => !type || ['unknown', 'shadow', 'stellar'].includes(type))) throw new Error(`Invalid types for ${form.id}.`);
  output[form.id] = formTypes;
  inventory.push({ ...form, identifier: row.identifier, types: formTypes });
}
const data = new URL('src/favorites/data/', root);
await mkdir(data, { recursive: true });
await writeFile(new URL('powerupTypes.json', data), `${JSON.stringify(output, null, 2)}\n`);
await writeFile(new URL('docs/favorite-picker-work/form-types/provenance.json', root), `${JSON.stringify({ repository: 'https://github.com/PokeAPI/pokeapi', revision, sources: tables.map(({ name, url, sha256 }) => ({ name, url, sha256 })), forms: inventory }, null, 2)}\n`);
console.log(`Verified ${inventory.length} battle forms from PokeAPI ${revision}.`);
console.log(`Written under ${fileURLToPath(root)}`);
