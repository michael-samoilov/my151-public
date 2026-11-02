/**
 * The Dex catalog projection: today's src/data/pokemon.json, byte for byte. A row's evolution
 * fields come from the first evolution into the form whose source form the Dex also lists; when the
 * Dex does not list that form, the row shows the source form's species default instead.
 */
import type { FormId } from '../../../src/ontology/ids';
import type { ResolvedForm } from '../../../src/ontology/model';
import type { Ontology } from '../resolve';

export interface DexRow {
  id: number;
  name: string;
  types: readonly string[];
  stats: ResolvedForm['facts']['baseStats'];
  bst: number;
  generation: number;
  evolutionChainId: number;
  evolvesFrom: number | null;
  evolutionStage: 1 | 2 | 3;
  evolutionLevel: number | null;
  isLegendary: boolean;
  isMythical: boolean;
  captureRate: number;
  growthRate: string;
  isBaby: boolean;
  sprite?: string;
  archetypes: never[];
  shape: string;
  color: string;
  eggGroups: readonly string[];
}

/** The parent a tool shows for a form: the primary evolution's source when the tool lists it, else that source's species default. */
export function parentInTool(ontology: Ontology, form: ResolvedForm, inTool: (form: ResolvedForm) => boolean): { parent: ResolvedForm; level: number | null } | null {
  const edge = form.evolvesFrom[0];
  if (!edge) return null;
  const source = ontology.forms.get(edge.from)!;
  const shown = inTool(source) ? source : ontology.forms.get(ontology.species.get(source.species)!.forms[0])!;
  return { parent: shown, level: edge.level };
}

export function stageOf(ontology: Ontology, form: ResolvedForm): 1 | 2 | 3 {
  let depth = 0;
  let current = form;
  const seen = new Set<FormId>();
  while (current.evolvesFrom[0] && !seen.has(current.id)) {
    seen.add(current.id);
    current = ontology.forms.get(current.evolvesFrom[0].from)!;
    depth += 1;
  }
  return Math.min(depth + 1, 3) as 1 | 2 | 3;
}

export function dexRows(ontology: Ontology): DexRow[] {
  const inDex = (form: ResolvedForm) => form.tools.dex === 'in';
  const rows = [...ontology.species.values()].map((species) => species.forms[0]);
  for (const { form, after } of ontology.authored.legacy.dex.formOrder) rows.splice(rows.indexOf(after) + 1, 0, form);
  // The script that appended the regional forms after the last species wrote "archetypes" before
  // "sprite"; every row inside the species block has them the other way round.
  const lastSpecies = rows.indexOf(ontology.species.get([...ontology.species.values()].at(-1)!.id)!.forms[0]);
  return rows.map((id, index) => ({ form: ontology.forms.get(id)!, appended: index > lastSpecies })).map(({ form, appended }) => {
    const species = ontology.species.get(form.species)!;
    const parent = parentInTool(ontology, form, inDex);
    const standIn = form.isDefault && species.standIn.dex ? ontology.authored.legacy.dex.standInSprites[species.id] ?? ontology.forms.get(species.standIn.dex)!.sprite : form.sprite;
    const sprite = `/sprites/pokemon/${standIn}.png`;
    const row: DexRow = {
      id: form.appId,
      name: form.id,
      types: form.facts.types,
      stats: form.facts.baseStats,
      bst: form.bst,
      generation: form.generation,
      evolutionChainId: ontology.authored.legacy.evolutionChains[form.species],
      evolvesFrom: parent ? parent.parent.appId : null,
      evolutionStage: stageOf(ontology, form),
      evolutionLevel: parent?.level ?? null,
      isLegendary: species.legendaryClass === 'sub-legendary' || species.legendaryClass === 'restricted',
      isMythical: species.legendaryClass === 'mythical',
      captureRate: species.captureRate,
      growthRate: species.growthRate,
      isBaby: species.tags.includes('baby'),
      ...(appended ? { archetypes: [], sprite } : { sprite, archetypes: [] }),
      shape: form.facts.shape,
      color: form.facts.color,
      eggGroups: form.facts.eggGroups,
    };
    return row;
  });
}

export const dexJson = (ontology: Ontology): string => `${JSON.stringify(dexRows(ontology))}\n`;
