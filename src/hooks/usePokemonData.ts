import { useMemo } from 'react';
import type { Pokemon } from '@/types/pokemon';
import pokemonData from '@/data/pokemon.json';
import { ARCHETYPES } from '@/data/archetypes';

const pokemonList = pokemonData as Pokemon[];

// Build lookup maps
const pokemonById = new Map<number, Pokemon>();
const pokemonByChain = new Map<number, Pokemon[]>();
for (const p of pokemonList) {
  // Attach archetypes
  p.archetypes = ARCHETYPES
    .filter(a => a.pokemonIds.includes(p.id))
    .map(a => a.id);
  pokemonById.set(p.id, p);

  // Group by evolution chain
  const chain = pokemonByChain.get(p.evolutionChainId) ?? [];
  chain.push(p);
  pokemonByChain.set(p.evolutionChainId, chain);
}

export function getPokemonById(id: number): Pokemon | undefined {
  return pokemonById.get(id);
}

export function getAllPokemon(): Pokemon[] {
  return pokemonList;
}

/**
 * Get the full linear evolution chain for a Pokemon, sorted by evolution stage.
 * For branching evolutions (e.g. Eevee), returns only the branch containing the given Pokemon.
 */
export function getEvolutionLine(pokemonId: number): Pokemon[] {
  const pokemon = pokemonById.get(pokemonId);
  if (!pokemon) return [];

  const chainMembers = pokemonByChain.get(pokemon.evolutionChainId) ?? [];
  if (chainMembers.length <= 1) return [pokemon];

  // Walk backwards from this Pokemon to find its root
  const ancestors: Pokemon[] = [];
  let current: Pokemon | undefined = pokemon;
  while (current?.evolvesFrom) {
    const parent = pokemonById.get(current.evolvesFrom);
    if (parent) ancestors.unshift(parent);
    current = parent;
  }

  // Walk forwards from this Pokemon to find descendants
  const descendants: Pokemon[] = [];
  let searchId = pokemon.id;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const child = chainMembers.find(p => p.evolvesFrom === searchId);
    if (!child) break;
    descendants.push(child);
    searchId = child.id;
  }

  return [...ancestors, pokemon, ...descendants];
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

export interface EvolutionGroup {
  chainId: number;
  members: Pokemon[];
}

/**
 * Groups filtered Pokemon into evolution lines.
 * Each group contains members from the same chain that passed the filter,
 * sorted by evolution stage. Groups are ordered by the lowest ID in the group.
 */
export function useFilteredPokemonGrouped(options: UseFilteredPokemonOptions): EvolutionGroup[] {
  const filtered = useFilteredPokemon(options);

  return useMemo(() => {
    const groups = new Map<number, Pokemon[]>();
    for (const p of filtered) {
      const chain = groups.get(p.evolutionChainId) ?? [];
      chain.push(p);
      groups.set(p.evolutionChainId, chain);
    }

    // Sort members within each group by stage, then by ID
    const result: EvolutionGroup[] = [];
    for (const [chainId, members] of groups) {
      members.sort((a, b) => a.evolutionStage - b.evolutionStage || a.id - b.id);
      result.push({ chainId, members });
    }

    // Sort groups by first member's ID
    result.sort((a, b) => a.members[0].id - b.members[0].id);
    return result;
  }, [filtered]);
}
