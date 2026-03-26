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
  types?: string[] | null;
  typeMode?: 'any' | 'all';
  generations?: number[] | null;
  excludeIds?: Set<number>;
  evoLineSize?: number[] | null; // [1], [2], [3] where 3 means 3+
}

export function useFilteredPokemon({
  search = '',
  archetype = null,
  types = null,
  typeMode = 'any',
  generations = null,
  excludeIds,
}: UseFilteredPokemonOptions): Pokemon[] {
  // Serialize excludeIds to a stable string for memo deps
  const excludeKey = useMemo(
    () => (excludeIds ? [...excludeIds].sort((a, b) => a - b).join(',') : ''),
    [excludeIds]
  );

  const typesKey = types ? types.join(',') : '';
  const gensKey = generations ? generations.join(',') : '';

  return useMemo(() => {
    let filtered = pokemonList;

    if (archetype) {
      const archetypeDef = ARCHETYPES.find(a => a.id === archetype);
      if (archetypeDef) {
        const idSet = new Set(archetypeDef.pokemonIds);
        filtered = filtered.filter(p => idSet.has(p.id));
      }
    }

    if (types && types.length > 0) {
      if (typeMode === 'all') {
        // AND mode: Pokemon must have ALL selected types (dual-type search)
        filtered = filtered.filter(p =>
          types.every(t => p.types.includes(t as never))
        );
      } else {
        // OR mode: Pokemon must have ANY of the selected types
        filtered = filtered.filter(p =>
          types.some(t => p.types.includes(t as never))
        );
      }
    }

    if (generations && generations.length > 0) {
      const genSet = new Set(generations);
      filtered = filtered.filter(p => genSet.has(p.generation));
    }

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.includes(q) || p.id.toString() === q
      );
    }

    if (excludeIds && excludeIds.size > 0) {
      filtered = filtered.filter(p => !excludeIds.has(p.id));
    }

    return filtered;
  }, [search, archetype, typesKey, typeMode, gensKey, excludeIds, excludeKey]);
}

export interface EvolutionGroup {
  chainId: number;
  members: Pokemon[];
  matchedIds: Set<number>; // which members actually matched the filter
}

/**
 * Groups filtered Pokemon into evolution lines.
 * Always surfaces the full evo line for any matched Pokemon.
 * matchedIds tracks which members directly matched the filter.
 * Chains with 6+ members (e.g. Eevee) are shown as individual entries.
 * Groups are ordered by the lowest ID in the group.
 */
export function useFilteredPokemonGrouped(options: UseFilteredPokemonOptions): EvolutionGroup[] {
  const filtered = useFilteredPokemon(options);

  // No useMemo — recompute every render to avoid stale cache issues.
  // Filtering ~1025 Pokemon is cheap enough.
  const filteredIds = new Set(filtered.map((p) => p.id));

  const seenChains = new Set<string>();
  const result: EvolutionGroup[] = [];

  for (const p of filtered) {
    const line = getEvolutionLine(p.id);

    // Skip chains with 6+ members — show individually
    const fullChain = pokemonByChain.get(p.evolutionChainId) ?? [];
    if (fullChain.length >= 6) {
      const key = `single-${p.id}`;
      if (seenChains.has(key)) continue;
      seenChains.add(key);
      result.push({
        chainId: p.evolutionChainId * 10000 + p.id,
        members: [p],
        matchedIds: new Set([p.id]),
      });
      continue;
    }

    const branchKey = line.map((m) => m.id).join('-');
    if (seenChains.has(branchKey)) continue;
    seenChains.add(branchKey);

    const matchedIds = new Set(line.filter((m) => filteredIds.has(m.id)).map((m) => m.id));

    result.push({
      chainId: p.evolutionChainId,
      members: line,
      matchedIds,
    });
  }

  result.sort((a, b) => a.members[0].id - b.members[0].id);

  // Post-filter by evo line size
  if (options.evoLineSize && options.evoLineSize.length > 0) {
    const sizes = new Set(options.evoLineSize);
    return result.filter(group => {
      const len = group.members.length;
      if (sizes.has(3) && len >= 3) return true;
      if (sizes.has(2) && len === 2) return true;
      if (sizes.has(1) && len === 1) return true;
      return false;
    });
  }

  return result;
}
