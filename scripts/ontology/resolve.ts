import type { AppId, FormId, SpeciesId, SpriteStem } from '../../src/ontology/ids';
import type { Coordinates, FormFacts, FormFlags, FormState, Persistence, ResolvedEvolution, ResolvedForm, ResolvedSpecies, ToolInclusion } from '../../src/ontology/model';
import { FACT_KEYS, MECHANICAL_FACT_KEYS } from '../../src/ontology/model';
import type { AuthoredOntology, FormEntry, Problem, SpeciesFile } from './authored';

export interface Ontology {
  readonly authored: AuthoredOntology;
  readonly species: ReadonlyMap<SpeciesId, ResolvedSpecies>;
  readonly forms: ReadonlyMap<FormId, ResolvedForm>;
  readonly fileOf: ReadonlyMap<FormId, string>;
}

export type Resolution = { readonly ok: true; readonly ontology: Ontology } | { readonly ok: false; readonly problems: readonly Problem[] };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function persistenceOf(states: readonly FormState[]): Persistence {
  if (states.length === 0) return 'permanent';
  return states.every((state) => state.kind === 'ride') ? 'field' : 'battle';
}

export function sharedCoordinates(entries: readonly Coordinates[]): Coordinates {
  const [first, ...rest] = entries;
  const agree = <K extends keyof Coordinates>(key: K) => rest.every((entry) => same(entry[key], first[key]));
  const variety = Object.fromEntries(Object.entries(first.variety).filter(([axis, value]) => rest.every((entry) => entry.variety[axis] === value)));
  return {
    region: agree('region') ? first.region : null,
    variety,
    sex: agree('sex') ? first.sex : null,
    fusion: agree('fusion') ? first.fusion : null,
  };
}

function coordinatesOf(entry: FormEntry | SpeciesFile['forms'][0]): Coordinates {
  return { region: entry.region ?? null, variety: entry.variety ?? {}, sex: entry.sex ?? null, fusion: entry.fusion ?? null };
}

function stepOf(entry: FormEntry): FormState | null {
  const state = entry.state;
  if (!state) return null;
  switch (state.kind) {
    case 'mega': return state.letter ? { kind: 'mega', letter: state.letter } : { kind: 'mega' };
    case 'terastal': return { kind: 'terastal', teraType: state.teraType! };
    case 'battle-mode': return state.trigger ? { kind: 'battle-mode', trigger: state.trigger } : { kind: 'battle-mode' };
    default: return { kind: state.kind };
  }
}

function flagsOf(coordinates: Coordinates, states: readonly FormState[], persistence: Persistence, spinoff: boolean, lookOnly: boolean): FormFlags {
  const has = (kind: FormState['kind']) => states.some((state) => state.kind === kind);
  return {
    regional: coordinates.region !== null,
    variety: Object.keys(coordinates.variety).length > 0,
    sex: coordinates.sex !== null,
    fusion: coordinates.fusion !== null,
    mega: has('mega'),
    primal: has('primal'),
    gigantamax: has('gigantamax'),
    eternamax: has('eternamax'),
    ultraBurst: has('ultra-burst'),
    terastal: has('terastal'),
    battleMode: has('battle-mode'),
    moveLook: has('move-look'),
    ride: has('ride'),
    battleOnly: persistence === 'battle',
    spinoff,
    lookOnly,
  };
}

export const mechanicallyEqual = (a: FormFacts, b: FormFacts): boolean => MECHANICAL_FACT_KEYS.every((key) => same(a[key], b[key]));

export function resolveOntology(authored: AuthoredOntology): Resolution {
  const problems: Problem[] = [];
  const forms = new Map<FormId, ResolvedForm>();
  const species = new Map<SpeciesId, ResolvedSpecies>();
  const fileOf = new Map<FormId, string>();
  const games = new Map<string, AuthoredOntology['games'][number]>(authored.games.map((game) => [game.id, game]));
  const appIdOf = new Map<string, AppId>();
  for (const [number, form] of authored.appIds.rows) appIdOf.set(form, number as AppId);
  const edgesInto = new Map<string, ResolvedEvolution[]>();
  const edgesFrom = new Map<string, ResolvedEvolution[]>();
  for (const { data } of authored.species) {
    for (const edge of data.evolutions) {
      const level = edge.methods.find((method) => method.trigger === 'level-up')?.conditions.find((condition) => condition.kind === 'level')?.level ?? null;
      const resolved: ResolvedEvolution = { from: edge.from, to: edge.to, level };
      edgesInto.set(edge.to, [...(edgesInto.get(edge.to) ?? []), resolved]);
      edgesFrom.set(edge.from, [...(edgesFrom.get(edge.from) ?? []), resolved]);
    }
  }

  const files = [...authored.species].sort((a, b) => a.data.species.nationalDex - b.data.species.nationalDex);
  for (const { file, data } of files) {
    const problem = (code: string, path: string, message: string) => problems.push({ code, file, path, message });
    const entries = data.forms;
    const defaultEntry = entries[0];
    const defaultGame = games.get(defaultEntry.debut);
    const speciesGeneration = defaultGame?.generation ?? null;
    if (speciesGeneration === null) problem('generation-missing', 'forms[0].debut', `the default form's debut game "${defaultEntry.debut}" has no generation`);
    const generationOf = (debut: string) => games.get(debut)?.generation ?? speciesGeneration ?? 0;

    const resolvedHere = new Map<string, ResolvedForm>();
    const pending = new Map(entries.map((entry, index) => [entry.id, { entry, index }]));
    const permanentIds = entries.filter((entry) => !entry.state).map((entry) => entry.id);
    const order: string[] = [];
    while (pending.size) {
      const isReady = (entry: SpeciesFile['forms'][number]): boolean => {
        if (!entry.state) return entry.id === defaultEntry.id || resolvedHere.has(defaultEntry.id);
        if (entry.state.from === 'any') return permanentIds.every((id) => resolvedHere.has(id));
        return entry.state.from.every((id) => resolvedHere.has(id));
      };
      const ready = [...pending.values()].find(({ entry }) => isReady(entry));
      if (!ready) {
        const stuck = [...pending.keys()];
        problem('state-cycle', `forms[${pending.get(stuck[0])!.index}].state.from`, `${stuck.join(', ')} enter from each other in a cycle`);
        break;
      }
      pending.delete(ready.entry.id);
      order.push(ready.entry.id);
      const { entry, index } = ready;
      const path = `forms[${index}]`;
      const step = stepOf(entry as FormEntry);
      const enteredFrom = step && entry.state ? (entry.state.from === 'any' ? permanentIds : [...entry.state.from]) : [];
      const bases = enteredFrom.map((id) => resolvedHere.get(id)!);
      const base = step ? bases[0] : index === 0 ? null : resolvedHere.get(defaultEntry.id)!;
      if (step && bases.some((other) => !same(other.states, bases[0].states))) {
        problem('state-entry-chains-differ', `${path}.state.from`, `${entry.id} is entered from forms with different state chains; list forms that share one chain`);
      }
      const own = Object.fromEntries(FACT_KEYS.filter((key) => key in entry).map((key) => [key, entry[key]]));
      const facts = { obtain: 'standard', shiny: 'available', ...(base?.facts ?? {}), ...own } as FormFacts;
      const states = step ? [...bases[0].states, step] : [];
      const coordinates = step ? sharedCoordinates(bases.map((other) => other.coordinates)) : coordinatesOf(entry);
      const persistence = persistenceOf(states);
      const game = games.get(facts.debut);
      const defaultFacts = index === 0 ? facts : resolvedHere.get(defaultEntry.id)!.facts;
      const appId = appIdOf.get(entry.id);
      if (appId === undefined) problem('app-id-missing', `${path}.id`, `"${entry.id}" has no row in ids/app-ids.json`);
      const tools: ToolInclusion = entry.tools ?? { picker: 'in', dex: 'in', league: 'in' };
      const form: ResolvedForm = {
        id: entry.id,
        appId: appId ?? (0 as AppId),
        species: data.species.id,
        nationalDex: data.species.nationalDex,
        isDefault: index === 0,
        base: base?.id ?? null,
        coordinates,
        states,
        enteredFrom: enteredFrom as FormId[],
        canBecome: [],
        persistence,
        facts,
        bst: Object.values(facts.baseStats).reduce((total, value) => total + value, 0),
        generation: generationOf(facts.debut),
        is: flagsOf(coordinates, states, persistence, game?.series !== 'mainline', index > 0 && mechanicallyEqual(facts, defaultFacts)),
        tools,
        sprite: entry.sprite as SpriteStem,
        evolvesFrom: edgesInto.get(entry.id) ?? [],
        evolvesTo: edgesFrom.get(entry.id) ?? [],
      };
      resolvedHere.set(entry.id, form);
      fileOf.set(entry.id, file);
    }
    for (const id of entries.map((entry) => entry.id)) {
      const form = resolvedHere.get(id);
      if (form) forms.set(form.id, form);
    }
    species.set(data.species.id, {
      id: data.species.id,
      nationalDex: data.species.nationalDex,
      forms: entries.map((entry) => entry.id),
      generation: speciesGeneration ?? 0,
      captureRate: data.species.captureRate,
      growthRate: data.species.growthRate,
      genderRatio: data.species.genderRatio,
      hatchCycles: data.species.hatchCycles,
      baseFriendship: data.species.baseFriendship,
      genus: data.species.genus,
      legendaryClass: data.species.legendaryClass,
      tags: data.species.tags,
      standIn: data.species.standIn,
    });
  }
  const canBecome = new Map<string, FormId[]>();
  for (const form of forms.values()) for (const from of form.enteredFrom) canBecome.set(from, [...(canBecome.get(from) ?? []), form.id]);
  for (const [id, targets] of canBecome) {
    const form = forms.get(id as FormId);
    if (form) forms.set(form.id, { ...form, canBecome: targets });
  }
  if (problems.length) return { ok: false, problems };
  return { ok: true, ontology: { authored, species, forms, fileOf } };
}
