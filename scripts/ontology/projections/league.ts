/**
 * The League projection, src/data/generated/league.json. The League catalog starts from the Dex
 * rows in src/data/pokemon.json, so this file holds only what differs: the fields of a Dex row the
 * League shows differently, each form the League adds as the fields that differ from its owner's
 * row, and the evolutions beyond a form's first.
 */
import type { Pokemon } from '../../../src/types/pokemon';
import type { ResolvedForm } from '../../../src/ontology/model';
import type { Ontology } from '../resolve';
import { dexRows, parentInTool, stageOf } from './dex';
import { isPowerUp, pickerOwner } from './owner';

/** A League catalog row: in the League and not a Mega, Primal, or Gigantamax power-up. Crowned Zacian is a row. */
export const inLeague = (form: ResolvedForm): boolean => form.tools.league === 'in' && !isPowerUp(form);

/** A League catalog row, with its sprite path before the revision query that src/lib/spriteUrl.ts adds. */
export type LeagueRow = Omit<Pokemon, 'archetypes'>;

/** Every League catalog row in catalog order: the Dex rows first, then the forms the League adds. */
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
  /** The row the form copies every field it does not state. The League groups archetypes and names under it. */
  readonly owner: number;
  readonly name: string;
  /** The sprite file name, when it is not the id. */
  readonly sprite?: string;
}

export interface LeagueProjection {
  /** A Dex row's fields that the League shows differently, by AppId. */
  readonly dex: Record<string, Fields>;
  /** In AppId order. */
  readonly forms: readonly LeagueForm[];
  /** [source, target] evolutions beyond the target's first, which a row's single evolvesFrom cannot hold. */
  readonly extraEvolutions: readonly (readonly [number, number])[];
}

function differingFields(row: LeagueRow, base: LeagueRow): Fields {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id' || key === 'name' || key === 'sprite') continue;
    if (JSON.stringify(value) !== JSON.stringify((base as unknown as Record<string, unknown>)[key])) fields[key] = value;
  }
  return fields as Fields;
}

export function leagueProjection(ontology: Ontology): LeagueProjection {
  const dex = new Map(dexRows(ontology).map(({ archetypes: _archetypes, ...row }) => [row.id, row as unknown as LeagueRow]));
  const rows = leagueRows(ontology);
  const shown = new Map(rows.map((row) => [row.id, row]));
  const byAppId = new Map<number, ResolvedForm>([...ontology.forms.values()].map((form) => [form.appId, form]));
  const dexChanges: Record<string, Fields> = {};
  const forms: LeagueForm[] = [];
  for (const row of rows) {
    const form = byAppId.get(row.id)!;
    if (form.tools.dex === 'in') {
      const fields = differingFields(row, dex.get(row.id)!);
      if (Object.keys(fields).length) dexChanges[row.id] = fields;
      continue;
    }
    const owner = pickerOwner(ontology, form);
    const ownerRow = shown.get(owner.appId);
    if (!ownerRow) throw new Error(`${form.id}: its owner ${owner.id} is not a League row, so the League has no row to copy its fields from.`);
    forms.push({
      id: row.id,
      owner: owner.appId,
      name: row.name,
      ...(form.sprite === String(form.appId) ? {} : { sprite: form.sprite }),
      ...differingFields(row, ownerRow),
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
  return { dex: dexChanges, forms, extraEvolutions };
}

export const leagueJson = (ontology: Ontology): string => `${JSON.stringify(leagueProjection(ontology))}\n`;
