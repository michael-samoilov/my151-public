import { useMemo } from 'react';
import type { Pokemon } from '@/types/pokemon';
import pokemonData from '@/data/pokemon.json';
import { ARCHETYPES } from '@/data/archetypes';

const pokemonList = pokemonData as Pokemon[];

// Build a lookup map by ID
const pokemonById = new Map<number, Pokemon>();
for (const p of pokemonList) {
  // Attach archetypes
  p.archetypes = ARCHETYPES
    .filter(a => a.pokemonIds.includes(p.id))
    .map(a => a.id);
  pokemonById.set(p.id, p);
}

export function getPokemonById(id: number): Pokemon | undefined {
  return pokemonById.get(id);
}

export function getAllPokemon(): Pokemon[] {
  return pokemonList;
}

interface UseFilteredPokemonOptions {
  search?: string;
  archetype?: string | null;
  type?: string | null;
  generation?: number | null;
  excludeIds?: Set<number>;
}

export function useFilteredPokemon({
  search = '',
  archetype = null,
  type = null,
  generation = null,
  excludeIds,
}: UseFilteredPokemonOptions): Pokemon[] {
  return useMemo(() => {
    let filtered = pokemonList;

    if (archetype) {
      const archetypeDef = ARCHETYPES.find(a => a.id === archetype);
      if (archetypeDef) {
        const idSet = new Set(archetypeDef.pokemonIds);
        filtered = filtered.filter(p => idSet.has(p.id));
      }
    }

    if (type) {
      filtered = filtered.filter(p => p.types.includes(type as never));
    }

    if (generation) {
      filtered = filtered.filter(p => p.generation === generation);
    }

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.includes(q) || p.id.toString() === q
      );
    }

    return filtered;
  }, [search, archetype, type, generation, excludeIds]);
}
