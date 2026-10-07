import { useMemo } from 'react';
import type { Pokemon } from '@/types/pokemon';
import pokemonData from '@/data/pokemon.json';
import { pokemonShape } from '@/data/pokemonShape';
import { ARCHETYPES } from '@/data/archetypes';
import { getCategoryById } from '@/data/categories';
import { normalizeSearch, speciesSearchText, useNamesVersion } from '@/i18n';

const pokemonList = pokemonData as Pokemon[];

// Reverse index of archetype membership, built by walking each archetype's
// own id list once. The previous shape — a `.filter()` over every archetype
// with an `.includes()` per pokemon — was ~2.2M array scans at import time,
// on the eager chunk that gates the first interaction. Iterating ARCHETYPES
// in the outer loop keeps each pokemon's archetype order unchanged.
// A few archetypes list the same id twice, so each list is de-duplicated
// against its own last entry — the old `.filter()` also yielded one entry
// per archetype.
const archetypesByPokemonId = new Map<number, string[]>();
for (const archetype of ARCHETYPES) {
  for (const id of archetype.pokemonIds) {
    const list = archetypesByPokemonId.get(id);
    if (!list) archetypesByPokemonId.set(id, [archetype.id]);
    else if (list[list.length - 1] !== archetype.id) list.push(archetype.id);
  }
}

// Build lookup maps
const pokemonById = new Map<number, Pokemon>();
const pokemonByChain = new Map<number, Pokemon[]>();
for (const p of pokemonList) {
  p.shape = pokemonShape(p.id, p.shape);
  // Attach archetypes
  p.archetypes = archetypesByPokemonId.get(p.id) ?? [];
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

// Alt form IDs that only appear in the evolution-item archetype browser.
// Hidden from general browsing, type/gen filters, search, etc.
const EVOLUTION_ITEM_ONLY_IDS = new Set(
  EXCLUSIVE_FORM_GROUPS.flatMap(group => group.slice(1)),
);

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
 * For a hypothetical placed-set on a chain, return true if any placed member is
 * left as a "dangling tail" — a non-terminal that *must* have a final evolution
 * placed but doesn't.
 *
 * A placed member only *requires* a placed descendant if it once existed with a
 * contemporary evolution — i.e. it has a child introduced in the same generation
 * as itself (Quilava→Typhlosion, both Gen 2; Pikachu→Raichu, both Gen 1). If all
 * of a member's children are from *later* generations, it once existed as a
 * complete standalone line and may be left a leaf (Magmar→Magmortar gen 4,
 * Zubat→Golbat→Crobat gen 2 — Crobat may be dropped).
 *
 * When a descendant IS required, it is satisfied by ANY placed member anywhere in
 * the member's subtree, through ANY branch — including a later-gen form. So
 * Pikachu + Raichu-Alola (no plain Raichu) is fine, as is Cyndaquil + Quilava +
 * Typhlosion-Hisui; and choosing a single same-gen branch (Silcoon→Beautifly,
 * not Cascoon→Dustox) is fine. What is NOT fine is leaving such a member with no
 * placed descendant at all (e.g. Cyndaquil + Quilava after removing the line's
 * only placed terminal, or lone Pikachu after removing Raichu-Alola).
 *
 * This complements isChainPlacementGapFree: that catches placed→unplaced→placed
 * gaps walking *up*; this catches a severed *tail* walking *down*.
 */
function hasDanglingTail(placed: Set<number>, chainId: number): boolean {
  const chainMembers = pokemonByChain.get(chainId) ?? [];
  for (const member of chainMembers) {
    if (!placed.has(member.id)) continue;
    const children = chainMembers.filter((c) => c.evolvesFrom === member.id);
    // Needs a placed descendant only if it had a same-generation evolution (it
    // never existed as a complete line on its own).
    const requiresDescendant = children.some((c) => c.generation <= member.generation);
    if (!requiresDescendant) continue;
    // Satisfied by any placed descendant through any branch (incl. later-gen forms).
    const anyDescendantPlaced = children.some((c) =>
      getDescendantIds(c.id).some((id) => placed.has(id)),
    );
    if (!anyDescendantPlaced) return true;
  }
  return false;
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
    // Individual removal is only safe if it leaves no gap *and* no dangling tail
    // (a placed non-terminal whose base-line evolution is now absent). Without the
    // tail check, removing a line's only placed terminal — e.g. Typhlosion-Hisui
    // from Cyndaquil→Quilava→Typhlosion-Hisui — would strand Cyndaquil + Quilava.
    if (
      isChainPlacementGapFree(hypothetical, target.evolutionChainId) &&
      !hasDanglingTail(hypothetical, target.evolutionChainId)
    ) {
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
  shapes?: string[] | null; // body-shape groups (Pokemon.shape)
  colors?: string[] | null; // Pokédex colors (Pokemon.color)
  eggGroups?: string[] | null; // egg groups (Pokemon.eggGroups — matches if any overlap)
  excludeIds?: Set<number>;
  /** When set, only these ids can appear (the league's "My dex" filter).
   *  Symmetric with excludeIds; both are keyed into the memo. */
  restrictToIds?: Set<number>;
  evoLineSize?: number[] | null; // [1], [2], [3] where 3 means 3+
}

function useFilteredPokemon({
  search = '',
  category = null,
  archetype = null,
  types = null,
  typeMode = 'any',
  generations = null,
  shapes = null,
  colors = null,
  eggGroups = null,
  excludeIds,
  restrictToIds,
}: UseFilteredPokemonOptions): Pokemon[] {
  // Serialize excludeIds to a stable string for memo deps
  const excludeKey = useMemo(
    () => (excludeIds ? `x:${[...excludeIds].sort((a, b) => a - b).join(',')}` : ''),
    [excludeIds]
  );
  // The `r:` prefix is what separates "restricted to nothing" from "not
  // restricted": both join to an empty string, so without it an empty
  // restriction reuses the unrestricted result. That is how the "My dex"
  // chip appeared to do nothing for a user whose dex is still empty — it
  // restricted to a set of none, and the memo handed back everything.
  const restrictKey = useMemo(
    () => (restrictToIds ? `r:${[...restrictToIds].sort((a, b) => a - b).join(',')}` : ''),
    [restrictToIds]
  );

  const typesKey = types ? types.join(',') : '';
  const gensKey = generations ? generations.join(',') : '';
  const shapesKey = shapes ? shapes.join(',') : '';
  const colorsKey = colors ? colors.join(',') : '';
  const eggGroupsKey = eggGroups ? eggGroups.join(',') : '';
  // Names arrive asynchronously and change with the locale, so the filter has
  // to recompute when either does — `useNamesVersion` ticks on both.
  const namesVersion = useNamesVersion();

  return useMemo(() => {
    // Read so the dependency is real rather than decorative: the memo's output
    // depends on the name catalog, which this counter stands in for.
    void namesVersion;
    let filtered = pokemonList;

    // When searching by name/number, ignore all other filters — the user
    // knows what they want and filters would only get in the way.
    if (search) {
      const q = normalizeSearch(search);
      filtered = filtered.filter(p => {
        // The English slug stays searchable in every locale. A Japanese user on
        // a Latin keyboard typing `pikachu` is the common case, not the
        // exception — and it is the only thing that works before the locale's
        // name catalog has finished loading.
        if (p.name.includes(q) || p.id.toString() === q) return true;
        const localized = speciesSearchText(p.id);
        return localized ? localized.includes(q) : false;
      });
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

      if (shapes && shapes.length > 0) {
        const shapeSet = new Set(shapes);
        filtered = filtered.filter(p => shapeSet.has(p.shape));
      }

      if (colors && colors.length > 0) {
        const colorSet = new Set(colors);
        filtered = filtered.filter(p => colorSet.has(p.color));
      }

      if (eggGroups && eggGroups.length > 0) {
        const eggSet = new Set(eggGroups);
        filtered = filtered.filter(p => p.eggGroups.some(g => eggSet.has(g)));
      }
    }

    if (archetype !== 'evolution-item') {
      filtered = filtered.filter(p => !EVOLUTION_ITEM_ONLY_IDS.has(p.id));
    }

    if (excludeIds && excludeIds.size > 0) {
      filtered = filtered.filter(p => !excludeIds.has(p.id));
    }

    if (restrictToIds) {
      filtered = filtered.filter(p => restrictToIds.has(p.id));
    }

    return filtered;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- excludeKey/restrictKey stand in for their Sets
  }, [search, category, archetype, typesKey, typeMode, gensKey, shapesKey, colorsKey, eggGroupsKey, excludeKey, restrictKey, namesVersion]);
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

    const hideFormAlts = options.archetype !== 'evolution-item';

    for (const p of filtered) {
      const lines = getAllEvolutionLines(p.id);

      for (const rawLine of lines) {
        const line = hideFormAlts ? rawLine.filter(m => !EVOLUTION_ITEM_ONLY_IDS.has(m.id)) : rawLine;
        if (line.length === 0) continue;

        const branchKey = line.map((m) => m.id).join('-');
        if (seenBranches.has(branchKey)) continue;
        seenBranches.add(branchKey);

        // After filtering alt forms, a truncated line (e.g. [Milcery])
        // is a strict subset of the full line ([Milcery, Alcremie]).
        // Skip it so we don't produce duplicate entries.
        if (line.length < rawLine.length) {
          const isSubset = result.some(
            g => g.members.length > line.length &&
              line.every(m => g.members.some(gm => gm.id === m.id)),
          );
          if (isSubset) continue;
        }

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
