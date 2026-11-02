/**
 * Reads data/ontology/, checks every file's shape and every reference, and returns the authored
 * ontology with branded ids. Every problem names the file and the field to fix.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { TOOLS } from '../../src/ontology/model';
import type { AppIdLedger, AuthoredOntology, DataSourceEntry, DecisionEntry, GameEntry, LegacyDex, LegacyPicker, Problem, SpeciesFile } from './authored';
import { readJson } from './json';

type Schema =
  | { readonly kind: 'string' } | { readonly kind: 'number' } | { readonly kind: 'null' }
  | { readonly kind: 'literal'; readonly values: readonly (string | number | null)[] }
  | { readonly kind: 'array'; readonly item: Schema; readonly min?: number }
  | { readonly kind: 'tuple'; readonly items: readonly Schema[] }
  | { readonly kind: 'object'; readonly fields: Readonly<Record<string, Schema>>; readonly optional?: readonly string[] }
  | { readonly kind: 'record'; readonly value: Schema }
  | { readonly kind: 'union'; readonly options: readonly Schema[] };

const string: Schema = { kind: 'string' };
const number: Schema = { kind: 'number' };
const literal = (...values: readonly (string | number | null)[]): Schema => ({ kind: 'literal', values });
const array = (item: Schema, min = 0): Schema => ({ kind: 'array', item, min });
const tuple = (...items: Schema[]): Schema => ({ kind: 'tuple', items });
const object = (fields: Record<string, Schema>, optional: readonly string[] = []): Schema => ({ kind: 'object', fields, optional });
const record = (value: Schema): Schema => ({ kind: 'record', value });
const union = (...options: Schema[]): Schema => ({ kind: 'union', options });
const strings = array(string);

function matches(value: unknown, schema: Schema): boolean {
  const problems: string[] = [];
  validate(value, schema, '', (message) => problems.push(message));
  return problems.length === 0;
}

function validate(value: unknown, schema: Schema, path: string, report: (message: string, path: string) => void): void {
  const fail = (expected: string) => report(`expected ${expected}, got ${JSON.stringify(value)?.slice(0, 80)}`, path);
  switch (schema.kind) {
    case 'string': if (typeof value !== 'string') fail('a string'); return;
    case 'number': if (typeof value !== 'number' || !Number.isFinite(value)) fail('a number'); return;
    case 'null': if (value !== null) fail('null'); return;
    case 'literal': if (!schema.values.includes(value as string)) fail(`one of ${schema.values.map((v) => JSON.stringify(v)).join(', ')}`); return;
    case 'array':
      if (!Array.isArray(value)) return fail('an array');
      if (value.length < (schema.min ?? 0)) return fail(`at least ${schema.min} item(s)`);
      value.forEach((item, index) => validate(item, schema.item, `${path}[${index}]`, report));
      return;
    case 'tuple':
      if (!Array.isArray(value) || value.length !== schema.items.length) return fail(`a tuple of ${schema.items.length}`);
      schema.items.forEach((item, index) => validate(value[index], item, `${path}[${index}]`, report));
      return;
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail('an object');
      const entries = value as Record<string, unknown>;
      for (const [key, field] of Object.entries(schema.fields)) {
        if (!(key in entries)) {
          if (!schema.optional?.includes(key)) report(`missing field "${key}"`, path);
          continue;
        }
        validate(entries[key], field, path ? `${path}.${key}` : key, report);
      }
      for (const key of Object.keys(entries)) if (!(key in schema.fields)) report(`unknown field "${key}"`, path);
      return;
    }
    case 'record':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail('an object');
      for (const [key, item] of Object.entries(value)) validate(item, schema.value, path ? `${path}.${key}` : key, report);
      return;
    case 'union':
      if (!schema.options.some((option) => matches(value, option))) fail(`one of ${schema.options.length} shapes`);
      return;
  }
}

const sourced = (keys: readonly string[]) => ({
  source: string,
  sourceOf: object(Object.fromEntries(keys.map((key) => [key, string])), keys),
});
const FACT_FIELDS = {
  types: union(tuple(string), tuple(string, string)),
  baseStats: object({ hp: number, atk: number, def: number, spe: number, spa: number, spd: number }),
  color: string,
  shape: string,
  eggGroups: strings,
  debut: string,
  obtain: literal('standard', 'event-only', 'story-only', 'spinoff-only', 'unobtainable'),
};
const FACT_KEYS = Object.keys(FACT_FIELDS);
const verdict = union(literal('in'), object({ out: union(literal('battle-state', 'spinoff-only', 'look-only'), object({ decision: string })) }));
const tools = object(Object.fromEntries(TOOLS.map((tool) => [tool, verdict])));
const STATE_FIELDS = { kind: string, from: union(literal('any'), array(string, 1)), letter: literal('x', 'y', 'z'), teraType: string };
const formSchema = object({
  id: string,
  sprite: string,
  externalIds: object({ pokeapiForm: string }, ['pokeapiForm']),
  region: string,
  variety: record(string),
  sex: literal('male', 'female'),
  fusion: string,
  state: object(STATE_FIELDS, ['letter', 'teraType']),
  ...FACT_FIELDS,
  tools,
  ...sourced([...FACT_KEYS, 'tools', 'sprite']),
}, ['externalIds', 'region', 'variety', 'sex', 'fusion', 'state', ...FACT_KEYS, 'tools', 'source', 'sourceOf']);
const speciesFileSchema = object({
  source: string,
  species: object({
    id: string,
    nationalDex: number,
    captureRate: number,
    growthRate: string,
    legendaryClass: literal('none', 'sub-legendary', 'restricted', 'mythical', 'ultra-beast'),
    tags: strings,
    varietyAxes: array(object({ axis: string, values: array(string, 1) })),
    standIn: object(Object.fromEntries(TOOLS.map((tool) => [tool, string])), TOOLS),
  }),
  forms: array(formSchema, 1),
  evolutions: array(object({
    from: string,
    to: string,
    methods: array(object({ games: literal('all'), trigger: literal('level-up'), conditions: array(object({ kind: literal('level'), level: number })) })),
    ...sourced(['methods']),
  }, ['source', 'sourceOf'])),
});
const ledgerSchema = object({ rows: array(tuple(number, string)), retired: array(object({ id: number, meant: string, why: string })) });
const gamesSchema = array(object({ id: string, series: literal('mainline', 'spinoff', 'mobile'), generation: union(number, { kind: 'null' }), region: union(string, { kind: 'null' }) }));
const idList = array(object({ id: string, note: string }, ['note']));
const decisionsSchema = array(object({ id: string, by: string, date: string, quote: string, where: string }));
const sourcesSchema = array(object({ id: string, kind: literal('legacy-file'), ref: string }));
const legacyPickerSchema = object({ ids: record(number), names: record(string), owners: record(string) });
const legacyDexSchema = object({ formOrder: array(object({ form: string, after: string })), standInSprites: record(string) });
const chainsSchema = record(number);

const STATE_KINDS = ['mega', 'primal', 'gigantamax', 'eternamax', 'ultra-burst', 'terastal', 'battle-mode', 'move-look', 'ride'];
const CORE_FACTS = FACT_KEYS.filter((key) => key !== 'obtain');
const COORDINATE_KEYS = ['region', 'variety', 'sex', 'fusion'];

export interface Loaded {
  readonly ontology: AuthoredOntology | null;
  readonly problems: readonly Problem[];
}

export function loadOntology(root: string): Loaded {
  const problems: Problem[] = [];
  const problem = (file: string, code: string, path: string, message: string) => problems.push({ code, file: relative(root, file).replaceAll('\\', '/'), path, message });

  function read<T>(file: string, schema: Schema): T | null {
    if (!existsSync(file)) {
      problem(file, 'missing-file', '', 'the file does not exist');
      return null;
    }
    let raw: unknown;
    try {
      raw = readJson(file);
    } catch (error) {
      problem(file, 'parse', '', `invalid JSON: ${(error as Error).message}`);
      return null;
    }
    const before = problems.length;
    validate(raw, schema, '', (message, path) => problem(file, 'shape', path, message));
    return problems.length === before ? (raw as T) : null;
  }
  const data = (name: string) => join(root, 'data', 'ontology', name);
  const vocab = (name: string) => read<readonly { id: string }[]>(data(`vocab/${name}.json`), idList)?.map((entry) => entry.id) ?? [];

  const speciesDirectory = data('species');
  const files = existsSync(speciesDirectory) ? readdirSync(speciesDirectory).filter((name) => name.endsWith('.json')).sort() : [];
  if (!files.length) problem(speciesDirectory, 'missing-file', '', 'no species files');
  const species = files.flatMap((name) => {
    const file = join(speciesDirectory, name);
    const parsed = read<SpeciesFile>(file, speciesFileSchema);
    if (!parsed) return [];
    checkSpeciesFile(parsed, (code, path, message) => problem(file, code, path, message));
    return [{ file: relative(root, file).replaceAll('\\', '/'), data: parsed }];
  });
  const appIds = read<AppIdLedger>(data('ids/app-ids.json'), ledgerSchema);
  const games = read<GameEntry[]>(data('vocab/games.json'), gamesSchema);
  const regions = vocab('regions');
  const varietyAxes = vocab('variety-axes');
  const vocabulary = { types: vocab('types'), colors: vocab('colors'), shapes: vocab('shapes'), eggGroups: vocab('egg-groups'), growthRates: vocab('growth-rates'), speciesTags: vocab('species-tags') };
  const decisions = read<DecisionEntry[]>(data('decisions.json'), decisionsSchema);
  const sources = read<DataSourceEntry[]>(data('sources.json'), sourcesSchema);
  const picker = read<LegacyPicker>(data('legacy/picker.json'), legacyPickerSchema);
  const dex = read<LegacyDex>(data('legacy/dex.json'), legacyDexSchema);
  const evolutionChains = read<Record<string, number>>(data('legacy/evolution-chains.json'), chainsSchema);
  if (problems.length || !appIds || !games || !decisions || !sources || !picker || !dex || !evolutionChains) return { ontology: null, problems };

  const ontology: AuthoredOntology = { species, appIds, games, regions, varietyAxes, vocab: vocabulary, decisions, sources, legacy: { picker, dex, evolutionChains } };
  linkOntology(ontology, problem);
  return { ontology: problems.length ? null : ontology, problems };
}

/** Rules one file can break on its own. */
function checkSpeciesFile(file: SpeciesFile, problem: (code: string, path: string, message: string) => void): void {
  const [defaultForm] = file.forms;
  const ids = new Set<string>();
  if (String(defaultForm.id) !== String(file.species.id)) problem('default-form-id', 'forms[0].id', `the default form must be named "${file.species.id}" after its species`);
  if (defaultForm.state) problem('default-form-state', 'forms[0].state', 'the default form cannot be a state');
  for (const fact of CORE_FACTS) if (!(fact in defaultForm)) problem('default-form-incomplete', `forms[0].${fact}`, `the default form must state "${fact}"`);
  file.forms.forEach((form, index) => {
    const path = `forms[${index}]`;
    if (ids.has(form.id)) problem('duplicate-id', `${path}.id`, `"${form.id}" appears twice in this file`);
    ids.add(form.id);
    const stated = COORDINATE_KEYS.filter((key) => key in form);
    if (form.state) {
      if (stated.length) problem('state-with-coordinates', `${path}.${stated[0]}`, 'a state form takes its coordinates from the forms it is entered from; remove the field');
      if (!STATE_KINDS.includes(form.state.kind)) problem('shape', `${path}.state.kind`, `expected one of ${STATE_KINDS.join(', ')}`);
      const state: Record<string, unknown> = form.state;
      if (form.state.kind === 'terastal' && !state.teraType) problem('shape', `${path}.state`, 'a terastal step names its teraType');
      if (form.state.kind !== 'terastal' && state.teraType) problem('shape', `${path}.state.teraType`, 'only a terastal step has a teraType');
      if (form.state.kind !== 'mega' && state.letter) problem('shape', `${path}.state.letter`, 'only a mega step has a letter');
      if (form.state.from !== 'any') for (const from of form.state.from) if (!file.forms.some((other) => other.id === from)) problem('dangling-link', `${path}.state.from`, `"${from}" is not a form of ${file.species.id}`);
    }
    if (index > 0 && !form.tools) problem('tools-missing', `${path}.tools`, `"${form.id}" needs a verdict for picker, dex, and league`);
    if (form.variety) for (const [axis, value] of Object.entries(form.variety)) {
      const declared = file.species.varietyAxes.find((entry) => entry.axis === axis);
      if (!declared) problem('variety-undeclared', `${path}.variety.${axis}`, `${file.species.id} does not declare the axis "${axis}" in species.varietyAxes`);
      else if (!declared.values.includes(value)) problem('variety-undeclared', `${path}.variety.${axis}`, `"${value}" is not a listed value of the axis "${axis}"`);
    }
  });
  file.evolutions.forEach((edge, index) => {
    if (!file.forms.some((form) => form.id === edge.to)) problem('dangling-link', `evolutions[${index}].to`, `"${edge.to}" is not a form of ${file.species.id}; evolutions live in the file of the species they evolve into`);
  });
  for (const [axisIndex, axis] of file.species.varietyAxes.entries()) {
    if (new Set(axis.values).size !== axis.values.length) problem('duplicate-id', `species.varietyAxes[${axisIndex}].values`, 'a value is listed twice');
  }
}

/** Rules that need every file: references between files and vocabularies. */
function linkOntology(ontology: AuthoredOntology, problem: (file: string, code: string, path: string, message: string) => void): void {
  const forms = new Map<string, { species: string; entry: SpeciesFile['forms'][number]; file: string }>();
  const speciesIds = new Map<string, string>();
  const gameIds = new Set(ontology.games.map((game) => game.id));
  const regions = new Set(ontology.regions);
  const axes = new Set(ontology.varietyAxes);
  const decisions = new Set(ontology.decisions.map((decision) => decision.id));
  const sources = new Set(ontology.sources.map((source) => source.id));
  const vocab = ontology.vocab;
  const dexNumbers = new Map<number, string>();
  for (const { file, data } of ontology.species) {
    if (speciesIds.has(data.species.id)) problem(file, 'duplicate-id', 'species.id', `"${data.species.id}" is also in ${speciesIds.get(data.species.id)}`);
    speciesIds.set(data.species.id, file);
    const owner = dexNumbers.get(data.species.nationalDex);
    if (owner) problem(file, 'duplicate-id', 'species.nationalDex', `National Dex number ${data.species.nationalDex} is also in ${owner}`);
    dexNumbers.set(data.species.nationalDex, file);
    data.forms.forEach((entry, index) => {
      const existing = forms.get(entry.id);
      if (existing) problem(file, 'duplicate-id', `forms[${index}].id`, `"${entry.id}" is also in ${existing.file}`);
      forms.set(entry.id, { species: data.species.id, entry, file });
    });
  }
  for (const { file, data } of ontology.species) {
    const check = (code: string, path: string, message: string) => problem(file, code, path, message);
    if (!sources.has(data.source)) check('dangling-link', 'source', `"${data.source}" is not in sources.json`);
    for (const tag of data.species.tags) if (!vocab.speciesTags.includes(tag)) check('dangling-link', 'species.tags', `"${tag}" is not in vocab/species-tags.json`);
    if (!vocab.growthRates.includes(data.species.growthRate)) check('dangling-link', 'species.growthRate', `"${data.species.growthRate}" is not in vocab/growth-rates.json`);
    for (const axis of data.species.varietyAxes) if (!axes.has(axis.axis)) check('dangling-link', 'species.varietyAxes', `"${axis.axis}" is not in vocab/variety-axes.json`);
    for (const [tool, form] of Object.entries(data.species.standIn)) {
      if (forms.get(form)?.species !== data.species.id) check('dangling-link', `species.standIn.${tool}`, `"${form}" is not a form of ${data.species.id}`);
    }
    data.forms.forEach((entry, index) => {
      const path = `forms[${index}]`;
      if (entry.region && !regions.has(entry.region)) check('dangling-link', `${path}.region`, `"${entry.region}" is not in vocab/regions.json`);
      if (entry.fusion && !speciesIds.has(entry.fusion)) check('dangling-link', `${path}.fusion`, `"${entry.fusion}" is not a species`);
      if (entry.debut && !gameIds.has(entry.debut)) check('dangling-link', `${path}.debut`, `"${entry.debut}" is not in vocab/games.json`);
      if (entry.types) for (const type of entry.types) if (!vocab.types.includes(type)) check('dangling-link', `${path}.types`, `"${type}" is not in vocab/types.json`);
      if (entry.color && !vocab.colors.includes(entry.color)) check('dangling-link', `${path}.color`, `"${entry.color}" is not in vocab/colors.json`);
      if (entry.shape && !vocab.shapes.includes(entry.shape)) check('dangling-link', `${path}.shape`, `"${entry.shape}" is not in vocab/shapes.json`);
      if (entry.eggGroups) for (const group of entry.eggGroups) if (!vocab.eggGroups.includes(group)) check('dangling-link', `${path}.eggGroups`, `"${group}" is not in vocab/egg-groups.json`);
      if (entry.source && !sources.has(entry.source)) check('dangling-link', `${path}.source`, `"${entry.source}" is not in sources.json`);
      for (const [field, source] of Object.entries(entry.sourceOf ?? {})) if (!sources.has(source)) check('dangling-link', `${path}.sourceOf.${field}`, `"${source}" is not in sources.json`);
      if (entry.state?.kind === 'terastal' && entry.state.teraType !== 'stellar' && !vocab.types.includes(entry.state.teraType)) check('dangling-link', `${path}.state.teraType`, `"${entry.state.teraType}" is not a type or "stellar"`);
      for (const tool of TOOLS) {
        const verdict = entry.tools?.[tool];
        if (verdict && verdict !== 'in' && typeof verdict.out === 'object' && !decisions.has(verdict.out.decision)) {
          check('dangling-link', `${path}.tools.${tool}`, `decision "${verdict.out.decision}" is not in decisions.json`);
        }
      }
    });
    data.evolutions.forEach((edge, index) => {
      if (!forms.has(edge.from)) check('dangling-link', `evolutions[${index}].from`, `"${edge.from}" is not a form`);
      if (edge.source && !sources.has(edge.source)) check('dangling-link', `evolutions[${index}].source`, `"${edge.source}" is not in sources.json`);
    });
  }
  const ledger = 'data/ontology/ids/app-ids.json';
  ontology.appIds.rows.forEach(([, form], index) => {
    if (!forms.has(form)) problem(ledger, 'dangling-link', `rows[${index}]`, `"${form}" is not a form`);
  });
  const legacyPicker = 'data/ontology/legacy/picker.json';
  for (const section of ['ids', 'names', 'owners'] as const) {
    for (const [form, value] of Object.entries(ontology.legacy.picker[section])) {
      if (!forms.has(form)) problem(legacyPicker, 'dangling-link', `${section}.${form}`, `"${form}" is not a form`);
      if (section === 'owners' && !forms.has(String(value))) problem(legacyPicker, 'dangling-link', `${section}.${form}`, `"${value}" is not a form`);
    }
  }
  ontology.legacy.dex.formOrder.forEach(({ form, after }, index) => {
    if (!forms.has(form)) problem('data/ontology/legacy/dex.json', 'dangling-link', `formOrder[${index}].form`, `"${form}" is not a form`);
    if (!forms.has(after)) problem('data/ontology/legacy/dex.json', 'dangling-link', `formOrder[${index}].after`, `"${after}" is not a form`);
  });
  for (const species of Object.keys(ontology.legacy.evolutionChains)) {
    if (!speciesIds.has(species)) problem('data/ontology/legacy/evolution-chains.json', 'dangling-link', species, `"${species}" is not a species`);
  }
  for (const species of speciesIds.keys()) {
    if (!(species in ontology.legacy.evolutionChains)) problem('data/ontology/legacy/evolution-chains.json', 'missing-row', species, `"${species}" has no evolution chain number`);
  }
  for (const game of ontology.games) {
    if (game.region !== null && !regions.has(game.region)) problem('data/ontology/vocab/games.json', 'dangling-link', game.id, `region "${game.region}" is not in vocab/regions.json`);
  }
}
