import { useMemo } from 'react';
import type { Pokemon } from '@/types/pokemon';
import pokemonData from '@/data/pokemon.json';
import { ARCHETYPES } from '@/data/archetypes';
import { getCategoryById } from '@/data/categories';

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

/**
 * Get a Pokemon and all its evolutionary descendants (children, grandchildren, etc.)
 * Used for branch removal: removing Gloom removes Vileplume and Bellossom too,
 * but not Oddish (the ancestor).
 */
export function getDescendantIds(pokemonId: number): number[] {
  const pokemon = pokemonById.get(pokemonId);
  if (!pokemon) return [pokemonId];
  const chainMembers = pokemonByChain.get(pokemon.evolutionChainId) ?? [];
  const result: number[] = [pokemonId];
  function collect(fromId: number) {
    for (const p of chainMembers) {
      if (p.evolvesFrom === fromId) {
        result.push(p.id);
        collect(p.id);
      }
    }
  }
  collect(pokemonId);
  return result;
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

/**
 * Get ALL evolution line branches that pass through a given Pokemon.
 * For Scyther, returns both [Scyther, Scizor] and [Scyther, Kleavor].
 * For non-branching Pokemon, returns a single-element array with one line.
 */
export function getAllEvolutionLines(pokemonId: number): Pokemon[][] {
  const pokemon = pokemonById.get(pokemonId);
  if (!pokemon) return [];

  const chainMembers = pokemonByChain.get(pokemon.evolutionChainId) ?? [];
  if (chainMembers.length <= 1) return [[pokemon]];

  // Walk backwards to find the root ancestor
  const ancestors: Pokemon[] = [];
  let current: Pokemon | undefined = pokemon;
  while (current?.evolvesFrom) {
    const parent = pokemonById.get(current.evolvesFrom);
    if (parent) ancestors.unshift(parent);
    current = parent;
  }
  const prefix = [...ancestors, pokemon];

  // Recursively collect all forward paths from a given ID
  function collectPaths(fromId: number): Pokemon[][] {
    const children = chainMembers.filter(p => p.evolvesFrom === fromId);
    if (children.length === 0) return [[]];
    const paths: Pokemon[][] = [];
    for (const child of children) {
      for (const subPath of collectPaths(child.id)) {
        paths.push([child, ...subPath]);
      }
    }
    return paths;
  }

  const suffixes = collectPaths(pokemon.id);
  return suffixes.map(suffix => [...prefix, ...suffix]);
}

interface UseFilteredPokemonOptions {
  search?: string;
  category?: string | null;
  archetype?: string | null;
  types?: string[] | null;
  typeMode?: 'any' | 'all';
  generations?: number[] | null;
  excludeIds?: Set<number>;
  evoLineSize?: number[] | null; // [1], [2], [3] where 3 means 3+
}

export function useFilteredPokemon({
  search = '',
  category = null,
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

    // When searching by name/number, ignore all other filters — the user
    // knows what they want and filters would only get in the way.
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.includes(q) || p.id.toString() === q
      );
    } else {
      if (category) {
        const categoryDef = getCategoryById(category);
        if (categoryDef) {
          filtered = filtered.filter(categoryDef.filter);
        }
      }

      if (archetype) {
        const archetypeDef = ARCHETYPES.find(a => a.id === archetype);
        if (archetypeDef) {
          const idSet = new Set(archetypeDef.pokemonIds);
          filtered = filtered.filter(p => idSet.has(p.id));
        }
      }

      if (types && types.length > 0) {
        if (typeMode === 'all') {
          if (types.length <= 2) {
            filtered = filtered.filter(p =>
              types.every(t => p.types.includes(t as never))
            );
          } else {
            filtered = filtered.filter(p =>
              types.filter(t => p.types.includes(t as never)).length >= 2
            );
          }
        } else {
          filtered = filtered.filter(p =>
            types.some(t => p.types.includes(t as never))
          );
        }
      }

      if (generations && generations.length > 0) {
        const genSet = new Set(generations);
        filtered = filtered.filter(p => genSet.has(p.generation));
      }
    }

    if (excludeIds && excludeIds.size > 0) {
      filtered = filtered.filter(p => !excludeIds.has(p.id));
    }

    return filtered;
  }, [search, category, archetype, typesKey, typeMode, gensKey, excludeIds, excludeKey]);
}

export interface EvolutionGroup {
  chainId: number;
  members: Pokemon[];
  matchedIds: Set<number>; // which members actually matched the filter
}

/**
 * Groups filtered Pokemon into evolution lines.
 * Each unique path from root to leaf is its own group.
 * Branching evolutions (Eevee, Wurmple) produce one group per branch.
 * matchedIds tracks which members directly matched the filter.
 * Groups are ordered by the lowest ID in the group.
 */
export function useFilteredPokemonGrouped(options: UseFilteredPokemonOptions): EvolutionGroup[] {
  const filtered = useFilteredPokemon(options);

  // No useMemo — recompute every render to avoid stale cache issues.
  const filteredIds = new Set(filtered.map((p) => p.id));

  const seenBranches = new Set<string>();
  const result: EvolutionGroup[] = [];

  for (const p of filtered) {
    const lines = getAllEvolutionLines(p.id);

    for (const line of lines) {
      const branchKey = line.map((m) => m.id).join('-');
      if (seenBranches.has(branchKey)) continue;
      seenBranches.add(branchKey);

      const matchedIds = new Set(line.filter((m) => filteredIds.has(m.id)).map((m) => m.id));

      result.push({
        chainId: p.evolutionChainId * 10000 + line[line.length - 1].id,
        members: line,
        matchedIds,
      });
    }
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
