import pokemonData from '@/data/pokemon.json';
import { pokemonShape } from '@/data/pokemonShape';
import type { Pokemon } from '@/types/pokemon';
import formMetadata from '../data/formMetadata.json';
import { pickerDexId, type PickerMon } from './catalog';

const byId = new Map((pokemonData as Pokemon[]).map(mon => [mon.id, mon]));
const overrides = formMetadata as Record<number, Partial<Pick<Pokemon, 'stats' | 'bst' | 'shape' | 'color' | 'captureRate' | 'growthRate' | 'eggGroups'>>>;
const parents = new Set(pokemonData.flatMap(mon => mon.evolvesFrom == null ? [] : [mon.evolvesFrom]));

function biologicalMetadata(mon: PickerMon) {
  return byId.get(pickerDexId(mon));
}

export function pickerPokemonMetadata(mon: PickerMon): Pokemon | undefined {
  const biological = biologicalMetadata(mon);
  return biological ? { ...biological, ...overrides[mon.id], id: mon.id, name: mon.name,
    types: mon.types, sprite: mon.sprite, generation: mon.generation,
    shape: pokemonShape(mon.id, overrides[mon.id]?.shape ?? biological.shape) } : undefined;
}

export function pickerEvolutionRole(mon: PickerMon) {
  const data = biologicalMetadata(mon);
  if (!data) return undefined;
  return data.isBaby ? 'basic' : data.evolvesFrom == null
    ? parents.has(data.id) ? 'basic' : 'standalone'
    : parents.has(data.id) ? 'intermediate' : 'final';
}
