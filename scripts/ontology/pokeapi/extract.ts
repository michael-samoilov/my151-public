import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PokeapiAbilities, PokeapiExtract, PokeapiFormRow, PokeapiPokemonRow, PokeapiSpeciesRow } from './source';
import { pokeapiExtractPath } from './source';

type Table =
  | 'abilities' | 'egg_groups' | 'growth_rates' | 'languages' | 'pokemon' | 'pokemon_abilities' | 'pokemon_colors' | 'pokemon_egg_groups'
  | 'pokemon_forms' | 'pokemon_shapes' | 'pokemon_species' | 'pokemon_species_names' | 'pokemon_stats' | 'pokemon_types' | 'stats' | 'types'
  | 'version_groups';
type Row = Readonly<Record<string, string>>;

// platform: PokeAPI CSV fields can hold commas, doubled quotes, and newlines, as RFC 4180 allows.
function parseCsv(text: string): Row[] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      record.push(field);
      records.push(record);
      field = '';
      record = [];
    } else field += char;
  }
  if (field.length || record.length) {
    record.push(field);
    records.push(record);
  }
  const [header, ...rows] = records;
  return rows.filter((row) => row.length > 1 || row[0] !== '').map((row) => Object.fromEntries(header.map((name, column) => [name, row[column] ?? ''])));
}

const flag = (value: string): boolean => value === '1';
const int = (value: string): number => {
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error(`expected an integer, got "${value}"`);
  return number;
};

export function extractPokeapi(directory: string, commit: string): PokeapiExtract {
  const files: { name: string; sha256: string }[] = [];
  const table = (name: Table): Row[] => {
    const content = readFileSync(join(directory, `${name}.csv`));
    files.push({ name: `${name}.csv`, sha256: createHash('sha256').update(content).digest('hex') });
    return parseCsv(content.toString('utf8'));
  };
  const identifierOf = (rows: Row[]): Map<string, string> => new Map(rows.map((row) => [row.id, row.identifier]));

  const abilityRows = table('abilities');
  const eggGroups = identifierOf(table('egg_groups'));
  const growthRates = identifierOf(table('growth_rates'));
  const english = table('languages').find((row) => row.identifier === 'en')!.id;
  const pokemonRows = table('pokemon');
  const abilityLinks = table('pokemon_abilities');
  const colors = identifierOf(table('pokemon_colors'));
  const eggGroupLinks = table('pokemon_egg_groups');
  const formRows = table('pokemon_forms');
  const shapes = identifierOf(table('pokemon_shapes'));
  const speciesRows = table('pokemon_species');
  const genusRows = table('pokemon_species_names');
  const statLinks = table('pokemon_stats');
  const typeLinks = table('pokemon_types');
  const stats = identifierOf(table('stats'));
  const types = identifierOf(table('types'));
  const versionGroups = identifierOf(table('version_groups'));

  const abilities = new Map(abilityRows.map((row) => [row.id, row]));
  const genus = new Map(genusRows.filter((row) => row.local_language_id === english).map((row) => [row.pokemon_species_id, row.genus]));
  const eggGroupsOf = new Map<string, string[]>();
  for (const row of eggGroupLinks) eggGroupsOf.set(row.species_id, [...(eggGroupsOf.get(row.species_id) ?? []), eggGroups.get(row.egg_group_id)!]);
  const speciesById = new Map<string, PokeapiSpeciesRow>();
  for (const row of speciesRows) {
    speciesById.set(row.id, {
      id: int(row.id),
      identifier: row.identifier,
      generation: int(row.generation_id),
      chain: int(row.evolution_chain_id),
      color: colors.get(row.color_id)!,
      shape: shapes.get(row.shape_id)!,
      eggGroups: eggGroupsOf.get(row.id) ?? [],
      genderRate: int(row.gender_rate),
      captureRate: int(row.capture_rate),
      baseHappiness: int(row.base_happiness),
      hatchCounter: int(row.hatch_counter),
      growthRate: growthRates.get(row.growth_rate_id)!,
      isBaby: flag(row.is_baby),
      isLegendary: flag(row.is_legendary),
      isMythical: flag(row.is_mythical),
      hasGenderDifferences: flag(row.has_gender_differences),
      genus: genus.get(row.id) ?? '',
    });
  }

  const STAT_KEY: Record<string, keyof PokeapiPokemonRow['stats']> = { hp: 'hp', attack: 'atk', defense: 'def', 'special-attack': 'spa', 'special-defense': 'spd', speed: 'spe' };
  const statsOf = new Map<string, Partial<PokeapiPokemonRow['stats']>>();
  for (const row of statLinks) statsOf.set(row.pokemon_id, { ...statsOf.get(row.pokemon_id), [STAT_KEY[stats.get(row.stat_id)!]]: int(row.base_stat) });
  const typesOf = new Map<string, string[]>();
  for (const row of typeLinks.sort((a, b) => int(a.slot) - int(b.slot))) typesOf.set(row.pokemon_id, [...(typesOf.get(row.pokemon_id) ?? []), types.get(row.type_id)!]);
  const abilitiesOf = new Map<string, PokeapiAbilities>();
  for (const row of abilityLinks) {
    const identifier = abilities.get(row.ability_id)!.identifier;
    const slot = row.is_hidden === '1' ? 'hidden' : row.slot === '1' ? 'first' : 'second';
    abilitiesOf.set(row.pokemon_id, { ...abilitiesOf.get(row.pokemon_id), [slot]: identifier });
  }
  const pokemonById = new Map<string, PokeapiPokemonRow>();
  for (const row of pokemonRows) {
    const own = statsOf.get(row.id);
    if (!own || Object.keys(own).length !== 6) throw new Error(`${row.identifier} has ${Object.keys(own ?? {}).length} stats`);
    pokemonById.set(row.id, {
      id: int(row.id),
      identifier: row.identifier,
      species: speciesById.get(row.species_id)!.identifier,
      isDefault: flag(row.is_default),
      height: int(row.height),
      weight: int(row.weight),
      types: typesOf.get(row.id) ?? [],
      stats: { hp: own.hp!, atk: own.atk!, def: own.def!, spa: own.spa!, spd: own.spd!, spe: own.spe! },
      abilities: abilitiesOf.get(row.id) ?? {},
    });
  }
  const forms: PokeapiFormRow[] = formRows.map((row) => ({
    id: int(row.id),
    identifier: row.identifier,
    pokemon: pokemonById.get(row.pokemon_id)!.identifier,
    isDefault: flag(row.is_default),
    isBattleOnly: flag(row.is_battle_only),
    isMega: flag(row.is_mega),
    versionGroup: versionGroups.get(row.introduced_in_version_group_id)!,
  }));

  const keyed = <T extends { identifier: string }>(rows: Iterable<T>): Record<string, T> => {
    const result: Record<string, T> = {};
    for (const row of rows) {
      if (result[row.identifier]) throw new Error(`identifier "${row.identifier}" appears twice`);
      result[row.identifier] = row;
    }
    return result;
  };
  return {
    repository: 'https://github.com/PokeAPI/pokeapi',
    commit,
    files,
    abilities: abilityRows.filter((row) => row.is_main_series === '1').map((row) => row.identifier),
    species: keyed(speciesById.values()),
    pokemon: keyed(pokemonById.values()),
    forms: keyed(forms),
  };
}

export function formatExtract(extract: PokeapiExtract): string {
  const section = <T>(rows: Record<string, T>) => `{\n${Object.entries(rows).map(([key, row]) => `    ${JSON.stringify(key)}: ${JSON.stringify(row)}`).join(',\n')}\n  }`;
  const head = ['repository', 'commit', 'files', 'abilities'].map((key) => `  ${JSON.stringify(key)}: ${JSON.stringify(extract[key as keyof PokeapiExtract])}`);
  return `{\n${head.join(',\n')},\n  "species": ${section(extract.species)},\n  "pokemon": ${section(extract.pokemon)},\n  "forms": ${section(extract.forms)}\n}\n`;
}

function main(): void {
  const [directory, commit] = process.argv.slice(2);
  if (!directory || !/^[0-9a-f]{40}$/.test(commit ?? '')) {
    console.error('usage: ontology:extract -- <csv directory> <40-character commit sha>');
    process.exit(2);
  }
  const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
  const extract = extractPokeapi(resolve(directory), commit);
  const path = join(root, pokeapiExtractPath(commit));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, formatExtract(extract));
  console.log(`${pokeapiExtractPath(commit)}: ${Object.keys(extract.species).length} species, ${Object.keys(extract.pokemon).length} pokemon, ${Object.keys(extract.forms).length} forms, ${extract.abilities.length} abilities.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
