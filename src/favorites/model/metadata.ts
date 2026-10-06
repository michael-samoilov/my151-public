import pokemonData from '@/data/pokemon.json';
import type { Pokemon } from '@/types/pokemon';
import formMetadata from '../data/formMetadata.json';
import { pickerDexId, type PickerMon } from './catalog';

const byId = new Map((pokemonData as Pokemon[]).map(mon => [mon.id, mon]));
const overrides = formMetadata as Record<number, Partial<Pick<Pokemon, 'stats' | 'bst' | 'shape' | 'color' | 'captureRate' | 'growthRate' | 'eggGroups'>>>;
const parents = new Set(pokemonData.flatMap(mon => mon.evolvesFrom == null ? [] : [mon.evolvesFrom]));

/** Biological Dex identity preserves regional evolution edges and cosmetic owner roles. */
function biologicalMetadata(mon: PickerMon) {
  return byId.get(pickerDexId(mon));
}

/** Actual form attributes; sprite/name/ID stay the user's selected form. */
export function pickerPokemonMetadata(mon: PickerMon): Pokemon | undefined {
  const biological = biologicalMetadata(mon);
  return biological ? { ...biological, ...overrides[mon.id], id: mon.id, name: mon.name,
    types: mon.types, sprite: mon.sprite, generation: mon.generation } : undefined;
}

/** Stage roles follow the biological form's evolution graph, not temporary battle power. */
export function pickerEvolutionRole(mon: PickerMon) {
  const data = biologicalMetadata(mon);
  if (!data) return undefined;
  return data.isBaby ? 'basic' : data.evolvesFrom == null
    ? parents.has(data.id) ? 'basic' : 'standalone'
    : parents.has(data.id) ? 'intermediate' : 'final';
}
