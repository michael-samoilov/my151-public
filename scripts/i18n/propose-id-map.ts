

import { readFileSync, writeFileSync } from 'node:fs';
import { ensureCsvs, readCsv } from './pokeapi';

const APP_DATA = 'src/data/pokemon.json';
const OUT = 'scripts/i18n/pokemon-id-map.json';

interface AppPokemon { id: number; name: string }

export interface IdMapEntry {
  appId: number;
  appName: string;
  speciesId: number;
  formId: number;
  formIdentifier: string;
  note?: string;
  needsReview?: true;
}

const OVERRIDES: Record<number, string> = {
  10254: 'alcremie-vanilla-cream-berry-sweet',
  10255: 'alcremie-vanilla-cream-love-sweet',
  10256: 'alcremie-vanilla-cream-star-sweet',
  10257: 'alcremie-vanilla-cream-clover-sweet',
  10258: 'alcremie-vanilla-cream-flower-sweet',
  10259: 'alcremie-vanilla-cream-ribbon-sweet',
};

function normalize(slug: string): string {
  return slug
    .replace(/-breed$/, '')
    .replace(/-gmax$/, '')
    .replace(/-standard$/, '')
    .replace(/-strike$/, '')
    .replace(/[^a-z0-9]/g, '');
}

async function main(): Promise<void> {
  await ensureCsvs();

  const app: AppPokemon[] = JSON.parse(readFileSync(APP_DATA, 'utf8'));
  const pokemon = new Map(readCsv('pokemon').map((r) => [Number(r.id), r]));
  const forms = readCsv('pokemon_forms');
  const formByPokemonId = new Map<number, Record<string, string>[]>();
  for (const f of forms) {
    const pid = Number(f.pokemon_id);
    if (!formByPokemonId.has(pid)) formByPokemonId.set(pid, []);
    formByPokemonId.get(pid)!.push(f);
  }
  const formByNormalized = new Map<string, Record<string, string>[]>();
  for (const f of forms) {
    const key = normalize(f.identifier);
    if (!formByNormalized.has(key)) formByNormalized.set(key, []);
    formByNormalized.get(key)!.push(f);
  }

  const entries: IdMapEntry[] = [];
  const review: string[] = [];

  const species = new Map(readCsv('pokemon_species').map((r) => [Number(r.id), r.identifier]));
  const formByIdentifier = new Map(forms.map((f) => [f.identifier, f]));
  const defaultFormForSpecies = new Map<number, Record<string, string>>();
  for (const f of forms) {
    const owner = pokemon.get(Number(f.pokemon_id));
    if (!owner || owner.is_default !== '1' || f.is_default !== '1') continue;
    defaultFormForSpecies.set(Number(owner.species_id), f);
  }

  const push = (
    p: AppPokemon,
    form: Record<string, string>,
    note?: string,
  ) => {
    const owner = pokemon.get(Number(form.pokemon_id));
    entries.push({
      appId: p.id,
      appName: p.name,
      speciesId: Number(owner?.species_id ?? 0),
      formId: Number(form.id),
      formIdentifier: form.identifier,
      ...(note ? { note } : {}),
    });
  };

  for (const p of app) {
    const upstream = pokemon.get(p.id);
    const upstreamName = upstream?.identifier ?? 'unknown';
    const collides = upstream !== undefined && upstream.identifier !== p.name;
    const why = collides ? `app id ${p.id} is "${upstreamName}" upstream` : undefined;

    const exact = formByIdentifier.get(p.name);
    if (exact) { push(p, exact, why); continue; }

    const bySpecies = upstream && species.get(Number(upstream.species_id)) === p.name
      ? defaultFormForSpecies.get(Number(upstream.species_id))
      : undefined;
    if (bySpecies) { push(p, bySpecies, why); continue; }

    const override = OVERRIDES[p.id] ? formByIdentifier.get(OVERRIDES[p.id]) : undefined;
    if (override) { push(p, override, `${why ?? `app id ${p.id}`}; mapped by hand to ${OVERRIDES[p.id]}`); continue; }

    const candidates = formByNormalized.get(normalize(p.name)) ?? [];
    if (candidates.length === 1) { push(p, candidates[0], why); continue; }

    entries.push({
      appId: p.id,
      appName: p.name,
      speciesId: 0,
      formId: 0,
      formIdentifier: '',
      note: `${why ?? ''}; ${candidates.length} slug candidates`,
      needsReview: true,
    });
    review.push(`${p.id} ${p.name}: ${candidates.length} candidates [${candidates.map((c) => c.identifier).join(', ')}]`);
  }

  entries.sort((a, b) => a.appId - b.appId);

  writeFileSync(
    OUT,
    [
      '{',
      `  "_comment": ${JSON.stringify(
        'Proposed by scripts/i18n/propose-id-map.ts, then hand-reviewed. Entries with a note are ones where the app id does not match PokeAPI, which is why this file exists. One entry per line, deliberately. Regenerate with: npm run i18n:propose-map',
      )},`,
      '  "entries": [',
      entries.map((e) => `    ${JSON.stringify(e)}`).join(',\n'),
      '  ]',
      '}',
      '',
    ].join('\n'),
  );

  const mismatched = entries.filter((e) => e.note && !e.needsReview).length;
  console.log(`${OUT}: ${entries.length} entries`);
  console.log(`  ${mismatched} resolved by slug because their id is another creature upstream`);
  console.log(`  ${entries.filter((e) => e.needsReview).length} need review`);
  for (const line of review) console.log(`    ! ${line}`);
}

void main();
