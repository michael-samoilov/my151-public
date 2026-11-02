import pokemonData from '@/data/pokemon.json';
import type { Pokemon } from '@/types/pokemon';
import favoritesMetadata from '@/data/generated/favorites-metadata.json';
import { pickerDexId, type PickerMon } from './catalog';

const PICKER_METADATA = favoritesMetadata as Record<string, Partial<Pokemon>>;

const byId = new Map((pokemonData as Pokemon[]).map(mon => [mon.id, mon]));
const parents = new Set(pokemonData.flatMap(mon => mon.evolvesFrom == null ? [] : [mon.evolvesFrom]));

function biologicalMetadata(mon: PickerMon) {
  return byId.get(pickerDexId(mon));
}

export function pickerPokemonMetadata(mon: PickerMon): Pokemon | undefined {
  const biological = biologicalMetadata(mon);
  return biological ? { ...biological, ...PICKER_METADATA[mon.id], id: mon.id, name: mon.name,
    types: mon.types, sprite: mon.sprite, generation: mon.generation } : undefined;
}

export function pickerEvolutionRole(mon: PickerMon) {
  const data = biologicalMetadata(mon);
  if (!data) return undefined;
  return data.isBaby ? 'basic' : data.evolvesFrom == null
    ? parents.has(data.id) ? 'basic' : 'standalone'
    : parents.has(data.id) ? 'intermediate' : 'final';
}
