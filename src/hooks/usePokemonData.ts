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

// Mutually exclusive forms — selecting one auto-removes the others.
// Each group is a set of IDs where at most one can be in the dex at a time.
const EXCLUSIVE_FORM_GROUPS: number[][] = [
  [892, 10227], // Urshifu Single Strike / Rapid Strike
  [869, 10254, 10255, 10256, 10257, 10258, 10259], // Alcremie sweets
];
const exclusiveFormsOf = new Map<number, number[]>();
for (const group of EXCLUSIVE_FORM_GROUPS) {
  for (const id of group) {
    exclusiveFormsOf.set(id, group.filter(other => other !== id));
  }
}

export function getExclusiveForms(pokemonId: number): number[] {
  return exclusiveFormsOf.get(pokemonId) ?? [];
}

export function getPokemonById(id: number): Pokemon | undefined {
  return pokemonById.get(id);
}

/**
 * Resolve a collection of Pokémon ids to their (defined) Pokemon records,
 * silently dropping any ids that don't resolve. Canonical replacement for the
 * `ids.map(getPokemonById).filter(Boolean).map(p => p!)` pattern.
 */
export function getPokemonByIds(ids: Iterable<number>): Pokemon[] {
  const out: Pokemon[] = [];
  for (const id of ids) {
    const p = pokemonById.get(id);
    if (p) out.push(p);
  }
  return out;
}

/** True if a Pokémon is "special": legendary, mythical, or (when a starter set
 *  is given) a starter. Canonical predicate for the repeated
 *  `p.isLegendary || p.isMythical || starters.has(p.id)` checks. */
export function isSpecial(p: Pokemon, starterIds?: Set<number>): boolean {
  return p.isLegendary || p.isMythical || (starterIds?.has(p.id) ?? false);
}

/** Filter out legendaries, mythicals, and (when a starter set is given) starters. */
export function withoutSpecials(pokemon: Pokemon[], starterIds?: Set<number>): Pokemon[] {
  return pokemon.filter((p) => !isSpecial(p, starterIds));
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

/**
 * For a hypothetical placed-set on a given evolution chain, return true if the
 * placed members form a gap-free structure: walking up evolvesFrom from any
 * placed member never goes placed → unplaced → placed. (Adjacent runs of
 * unplaced ancestors above the highest placed root are fine.)
 */
function isChainPlacementGapFree(placed: Set<number>, chainId: number): boolean {
  const chainMembers = pokemonByChain.get(chainId) ?? [];
  for (const member of chainMembers) {
    if (!placed.has(member.id)) continue;
    let cursor: Pokemon | undefined = member;
    let sawUnplaced = false;
    while (cursor?.evolvesFrom) {
      const parent = pokemonById.get(cursor.evolvesFrom);
      if (!parent) break;
      if (!placed.has(parent.id)) {
        sawUnplaced = true;
      } else if (sawUnplaced) {
        return false;
      }
      cursor = parent;
    }
  }
  return true;
}

/**
 * Compute the set of IDs to remove when the user clicks the delete button on
 * `pokemonId` in a section currently containing `sectionIds`.
 *
 * Two modes:
 *  1. Individual removal — only `pokemonId` is removed. Allowed when the target
 *     was introduced in a later generation than at least one other placed
 *     member of the same evolution chain, AND removing it alone keeps the
 *     placed chain gap-free. Lets users drop cross-gen babies (Pichu) or
 *     cross-gen later forms (Magmortar) while keeping the original line.
 *  2. Cascade — target + all descendants + ancestors that become stranded
 *     (no remaining placed descendants). The pre-existing branch-delete
 *     behavior, used when individual removal would create a gap or no
 *     cross-gen relationship exists.
 *
 * Returns only IDs that are currently in `sectionIds`.
 */
export function computeRemovalCascade(pokemonId: number, sectionIds: number[]): Set<number> {
  const sectionSet = new Set(sectionIds);
  const target = pokemonById.get(pokemonId);
  if (!target || !sectionSet.has(pokemonId)) return new Set([pokemonId]);

  // Mode 1: individual removal eligibility.
  const chainMembers = pokemonByChain.get(target.evolutionChainId) ?? [];
  const hasEarlierGenPlaced = chainMembers.some(
    (m) => m.id !== pokemonId && sectionSet.has(m.id) && m.generation < target.generation,
  );
  if (hasEarlierGenPlaced) {
    const hypothetical = new Set(sectionIds);
    hypothetical.delete(pokemonId);
    if (isChainPlacementGapFree(hypothetical, target.evolutionChainId)) {
      return new Set([pokemonId]);
    }
  }

  // Mode 2: cascade. Remove target + descendants present in section, then walk
  // up ancestors that become stranded (no remaining placed descendants).
  const removeSet = new Set(getDescendantIds(pokemonId).filter((id) => sectionSet.has(id)));
  const remaining = new Set(sectionIds.filter((id) => !removeSet.has(id)));
  let current: Pokemon | undefined = target;
  while (current?.evolvesFrom) {
    const parent = pokemonById.get(current.evolvesFrom);
    if (!parent || !remaining.has(parent.id)) break;
    const parentDescendants = getDescendantIds(parent.id);
    const hasRemaining = parentDescendants.some((id) => id !== parent.id && remaining.has(id));
    if (!hasRemaining) {
      remaining.delete(parent.id);
      removeSet.add(parent.id);
      current = parent;
    } else {
      break;
    }
  }
  return removeSet;
}

export function getAllPokemon(): Pokemon[] {
  return pokemonList;
}

/**
 * All pokemon in the same evolution chain as `pokemonId`, including every
 * branch (e.g. Wurmple → Silcoon, Cascoon, Beautifly, Dustox). Unordered.
 * Singletons return [pokemonId].
 *
 * Used by drag-to-rearrange to treat branched chains as a single atomic
 * bundle. Callers that want just the linear path through a pokemon should
 * keep using getEvolutionLine.
 */
export function getEvolutionChainIds(pokemonId: number): number[] {
  const p = pokemonById.get(pokemonId);
  if (!p) return [pokemonId];
  const members = pokemonByChain.get(p.evolutionChainId) ?? [p];
  return members.map((m) => m.id);
}

/**
 * Get the full linear evolution chain for a Pokemon, sorted by evolution stage.
 * For branching evolutions (e.g. Eevee), returns only the branch containing the given Pokemon.
 * When placedIds is provided, forward walks prefer branches containing placed Pokemon.
 */
export function getEvolutionLine(pokemonId: number, placedIds?: Set<number>): Pokemon[] {
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
    const children = chainMembers.filter(p => p.evolvesFrom === searchId);
    if (children.length === 0) break;
    // Prefer a placed child when there are multiple branches
    const child = (placedIds && children.length > 1
      ? children.find(c => placedIds.has(c.id))
      : undefined) ?? children[0];
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
function getAllEvolutionLines(pokemonId: number): Pokemon[][] {
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

function useFilteredPokemon({
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
  const evoLineSizeKey = options.evoLineSize ? options.evoLineSize.join(',') : '';

  // Memoized on the already-memoized `filtered` array. Only recomputes
  // when filter inputs actually change — big INP win, since this walks
  // every pokemon's evolution chain and was running on every render.
  return useMemo(() => {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, evoLineSizeKey]);
}
