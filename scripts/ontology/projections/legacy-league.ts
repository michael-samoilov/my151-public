/**
 * Today's League catalog rows, rebuilt from the ontology: what getAllPokemon() in
 * src/league/data/catalog.ts returns, minus the archetype lists the app layers on at runtime.
 */
import { revisedSprite } from '../../../src/lib/spriteUrl';
import type { Pokemon } from '../../../src/types/pokemon';
import type { ResolvedForm } from '../../../src/ontology/model';
import type { Ontology } from '../resolve';
import { dexRows, parentInTool, stageOf } from './dex';
import { isPowerUp } from './legacy-picker';

export const inLeague = (form: ResolvedForm): boolean => form.tools.league === 'in' && form.states.length === 0;

export type LeagueRow = Omit<Pokemon, 'archetypes'>;

export function leagueRows(ontology: Ontology): LeagueRow[] {
  const dex = new Map(dexRows(ontology).map((row) => [row.id, row]));
  const rows: LeagueRow[] = [];
  const defaults: LeagueRow[] = [];
  const others: LeagueRow[] = [];
  for (const form of ontology.forms.values()) {
    if (!inLeague(form) || isPowerUp(form)) continue;
    const species = ontology.species.get(form.species)!;
    const parent = parentInTool(ontology, form, inLeague);
    const base = dex.get(form.tools.dex === 'in' ? form.appId : ontology.forms.get(species.forms[0])!.appId)!;
    const { archetypes: _archetypes, ...dexFields } = base;
    void _archetypes;
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
      sprite: revisedSprite(form.tools.dex === 'in' ? base.sprite! : `/sprites/pokemon/${form.sprite}.png`),
      shape: form.facts.shape as Pokemon['shape'],
      evolvesFrom: parent ? parent.parent.appId : null,
      evolutionStage: stageOf(ontology, form),
      evolutionLevel: parent?.level ?? null,
    };
    (form.tools.dex === 'in' ? defaults : others).push(row);
  }
  rows.push(...defaults, ...others);
  return rows;
}
