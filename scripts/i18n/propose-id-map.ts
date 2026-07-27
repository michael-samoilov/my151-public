/**
 * Proposes `scripts/i18n/pokemon-id-map.json` — the explicit link from each id
 * in src/data/pokemon.json to a PokeAPI species and form.
 *
 * This exists because the obvious join is wrong. 13 of the 64 alt-form entries
 * carry an id that belongs to a *different* creature upstream: app 10254 is
 * Alcremie Berry Sweet, but PokeAPI's pokemon.csv 10254 is Oinkologne Female.
 * Joining on id would silently label six Alcremie forms as Gen 9 Pokémon in
 * eight languages, and nothing in English would ever reveal it.
 *
 * So the mapping is data, not an algorithm: proposed here by slug matching,
 * then checked in and gated by verify-names.ts. The proposal is deliberately
 * conservative — anything it cannot match with confidence is emitted as
 * `needsReview` rather than guessed at.
 *
 * Run: npm run i18n:propose-map
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ensureCsvs, readCsv } from './pokeapi';

const APP_DATA = 'src/data/pokemon.json';
const OUT = 'scripts/i18n/pokemon-id-map.json';

interface AppPokemon { id: number; name: string }

export interface IdMapEntry {
  appId: number;
  /** Recorded so drift in either direction is detectable. */
  appName: string;
  speciesId: number;
  formId: number;
  formIdentifier: string;
  /** Present only where the app id does NOT match PokeAPI's id for this
   *  creature — the collisions that make a naive join unsafe. */
  note?: string;
  needsReview?: true;
}

/**
 * Forms the app names in a way no upstream slug matches, resolved by hand.
 *
 * The six Alcremie entries are sweet variants: the app names them by sweet
 * ("alcremie-berry") while PokeAPI enumerates cream × sweet
 * ("alcremie-vanilla-cream-berry-sweet"), 63 rows for one species. Vanilla
 * cream is the one the app's sprite shows.
 *
 * Urshifu is a different trap — the app's id 10227 is PokeAPI's *Gigantamax*
 * Rapid Strike form, but the app means the ordinary one, so the exact-slug
 * rule below picks the right row and this only records why the id lied.
 */
const OVERRIDES: Record<number, string> = {
  10254: 'alcremie-vanilla-cream-berry-sweet',
  10255: 'alcremie-vanilla-cream-love-sweet',
  10256: 'alcremie-vanilla-cream-star-sweet',
  10257: 'alcremie-vanilla-cream-clover-sweet',
  10258: 'alcremie-vanilla-cream-flower-sweet',
  10259: 'alcremie-vanilla-cream-ribbon-sweet',
};

/** Slug differences that are naming style, not identity. */
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

    // 1. The app slug names a form outright — every regional form, and every
    //    base species PokeAPI happens to slug the same way.
    const exact = formByIdentifier.get(p.name);
    if (exact) { push(p, exact, why); continue; }

    // 2. The app slug names a *species*, and PokeAPI slugs its default form
    //    differently ("oricorio" vs "oricorio-baile"). Same creature.
    const bySpecies = upstream && species.get(Number(upstream.species_id)) === p.name
      ? defaultFormForSpecies.get(Number(upstream.species_id))
      : undefined;
    if (bySpecies) { push(p, bySpecies, why); continue; }

    // 3. Hand-resolved, because no slug rule can bridge the naming.
    const override = OVERRIDES[p.id] ? formByIdentifier.get(OVERRIDES[p.id]) : undefined;
    if (override) { push(p, override, `${why ?? `app id ${p.id}`}; mapped by hand to ${OVERRIDES[p.id]}`); continue; }

    // 4. Last resort: a unique match once naming-style suffixes are stripped.
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
    `${JSON.stringify(
      {
        _comment:
          'Proposed by scripts/i18n/propose-id-map.ts, then hand-reviewed. Entries with a note are ones where the app id does not match PokeAPI, which is why this file exists. Regenerate with: npm run i18n:propose-map',
        entries,
      },
      null,
      2,
    )}\n`,
  );

  const mismatched = entries.filter((e) => e.note && !e.needsReview).length;
  console.log(`${OUT}: ${entries.length} entries`);
  console.log(`  ${mismatched} resolved by slug because their id is another creature upstream`);
  console.log(`  ${entries.filter((e) => e.needsReview).length} need review`);
  for (const line of review) console.log(`    ! ${line}`);
}

void main();
