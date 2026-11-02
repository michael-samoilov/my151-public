import type { Pokemon } from '../../../src/types/pokemon';
import type { ResolvedForm } from '../../../src/ontology/model';
import type { Ontology } from '../resolve';
import { dexRows, parentInTool, stageOf } from './dex';
import { differingFields } from './diff';
import { isPowerUp, pickerOwner } from './owner';

const LEAGUE_SKIP = ['id', 'name', 'sprite'];

export const inLeague = (form: ResolvedForm): boolean => form.tools.league === 'in' && !isPowerUp(form);

export type LeagueRow = Omit<Pokemon, 'archetypes'>;

export function leagueRows(ontology: Ontology): LeagueRow[] {
  const dex = new Map(dexRows(ontology).map((row) => [row.id, row]));
  const defaults: LeagueRow[] = [];
  const others: LeagueRow[] = [];
  for (const form of ontology.forms.values()) {
    if (!inLeague(form)) continue;
    const species = ontology.species.get(form.species)!;
    const parent = parentInTool(ontology, form, inLeague);
    const base = dex.get(form.tools.dex === 'in' ? form.appId : ontology.forms.get(species.forms[0])!.appId)!;
    const { archetypes: _archetypes, ...dexFields } = base;
    const row: LeagueRow = {
      ...(dexFields as unknown as LeagueRow),
      id: form.appId,
      name: form.id,
      types: [...form.facts.types] as Pokemon['types'],
      stats: form.facts.baseStats,
      bst: form.bst,
      generation: form.generation,
      color: form.facts.color as Pokemon['color'],
      eggGroups: [...form.facts.eggGroups] as Pokemon['eggGroups'],
      sprite: form.tools.dex === 'in' ? base.sprite! : `/sprites/pokemon/${form.sprite}.png`,
      shape: form.facts.shape as Pokemon['shape'],
      evolvesFrom: parent ? parent.parent.appId : null,
      evolutionStage: stageOf(ontology, form),
      evolutionLevel: parent?.level ?? null,
    };
    (form.tools.dex === 'in' ? defaults : others).push(row);
  }
  return [...defaults, ...others];
}

type Fields = Partial<Omit<LeagueRow, 'id' | 'name' | 'sprite'>>;

export interface LeagueForm extends Fields {
  readonly id: number;
  readonly owner: number;
  readonly name: string;
  readonly spriteStem?: string;
}

export interface LeagueProjection {
  readonly dexOverrides: Record<string, Fields>;
  readonly forms: readonly LeagueForm[];
  readonly extraEvolutions: readonly (readonly [number, number])[];
}

export function leagueProjection(ontology: Ontology): LeagueProjection {
  const dex = new Map(dexRows(ontology).map(({ archetypes: _archetypes, ...row }) => [row.id, row as unknown as LeagueRow]));
  const rows = leagueRows(ontology);
  const shown = new Map(rows.map((row) => [row.id, row]));
  const byAppId = new Map<number, ResolvedForm>([...ontology.forms.values()].map((form) => [form.appId, form]));
  const dexOverrides: Record<string, Fields> = {};
  const forms: LeagueForm[] = [];
  for (const row of rows) {
    const form = byAppId.get(row.id)!;
    if (form.tools.dex === 'in') {
      const fields = differingFields(row, dex.get(row.id)!, LEAGUE_SKIP) as Fields;
      if (Object.keys(fields).length) dexOverrides[row.id] = fields;
      continue;
    }
    const owner = pickerOwner(ontology, form);
    const ownerRow = shown.get(owner.appId);
    if (!ownerRow) throw new Error(`${form.id}: its owner ${owner.id} is not a League row, so the League has no row to copy its fields from.`);
    forms.push({
      id: row.id,
      owner: owner.appId,
      name: row.name,
      ...(form.sprite === String(form.appId) ? {} : { spriteStem: form.sprite }),
      ...(differingFields(row, ownerRow, LEAGUE_SKIP) as Fields),
    });
  }
  const extraEvolutions: [number, number][] = [];
  for (const form of ontology.forms.values()) {
    if (!inLeague(form)) continue;
    const primary = parentInTool(ontology, form, inLeague)?.parent.appId;
    for (const edge of form.evolvesFrom.slice(1)) {
      const source = ontology.forms.get(edge.from)!;
      if (inLeague(source) && source.appId !== primary) extraEvolutions.push([source.appId, form.appId]);
    }
  }
  forms.sort((a, b) => a.id - b.id);
  return { dexOverrides, forms, extraEvolutions };
}

export const leagueJson = (ontology: Ontology): string => `${JSON.stringify(leagueProjection(ontology))}\n`;
