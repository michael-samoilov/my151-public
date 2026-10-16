import { useMemo } from 'react';
import type { Pokemon } from '@/types/pokemon';
import pokemonData from '@/data/pokemon.json';
import { pokemonShape } from '@/data/pokemonShape';
import { ARCHETYPES } from '@/data/archetypes';
import { getCategoryById } from '@/data/categories';
import { normalizeSearch, formSearchText, speciesSearchText, pokemonLabel, useNamesVersion } from '@/i18n';
import { revisedSprite } from '@/lib/spriteUrl';

const pokemonList = (pokemonData as Pokemon[]).map((p) => {
  const sprite = revisedSprite(p.sprite);
  return sprite === p.sprite ? p : { ...p, sprite };
});

const archetypesByPokemonId = new Map<number, string[]>();
for (const archetype of ARCHETYPES) {
  for (const id of archetype.pokemonIds) {
    const list = archetypesByPokemonId.get(id);
    if (!list) archetypesByPokemonId.set(id, [archetype.id]);
    else if (list[list.length - 1] !== archetype.id) list.push(archetype.id);
  }
}

const pokemonById = new Map<number, Pokemon>();
const pokemonByChain = new Map<number, Pokemon[]>();
for (const p of pokemonList) {
  p.shape = pokemonShape(p.id, p.shape);
  p.archetypes = archetypesByPokemonId.get(p.id) ?? [];
  pokemonById.set(p.id, p);

  const chain = pokemonByChain.get(p.evolutionChainId) ?? [];
  chain.push(p);
  pokemonByChain.set(p.evolutionChainId, chain);
}

const EXCLUSIVE_FORM_GROUPS: number[][] = [
  [892, 10227],
  [869, 10254, 10255, 10256, 10257, 10258, 10259],
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

const EVOLUTION_ITEM_ONLY_IDS = new Set(
  EXCLUSIVE_FORM_GROUPS.flatMap(group => group.slice(1)),
);

export function getPokemonById(id: number): Pokemon | undefined {
  return pokemonById.get(id);
}

export function getPokemonByIds(ids: Iterable<number>): Pokemon[] {
  const out: Pokemon[] = [];
  for (const id of ids) {
    const p = pokemonById.get(id);
    if (p) out.push(p);
  }
  return out;
}

export function isSpecial(p: Pokemon, starterIds?: Set<number>): boolean {
  return p.isLegendary || p.isMythical || (starterIds?.has(p.id) ?? false);
}

export function withoutSpecials(pokemon: Pokemon[], starterIds?: Set<number>): Pokemon[] {
  return pokemon.filter((p) => !isSpecial(p, starterIds));
}

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

function hasDanglingTail(placed: Set<number>, chainId: number): boolean {
  const chainMembers = pokemonByChain.get(chainId) ?? [];
  for (const member of chainMembers) {
    if (!placed.has(member.id)) continue;
    const children = chainMembers.filter((c) => c.evolvesFrom === member.id);
    const requiresDescendant = children.some((c) => c.generation <= member.generation);
    if (!requiresDescendant) continue;
    const anyDescendantPlaced = children.some((c) =>
      getDescendantIds(c.id).some((id) => placed.has(id)),
    );
    if (!anyDescendantPlaced) return true;
  }
  return false;
}

export function computeRemovalCascade(pokemonId: number, sectionIds: number[]): Set<number> {
  const sectionSet = new Set(sectionIds);
  const target = pokemonById.get(pokemonId);
  if (!target || !sectionSet.has(pokemonId)) return new Set([pokemonId]);

  const chainMembers = pokemonByChain.get(target.evolutionChainId) ?? [];
  const hasEarlierGenPlaced = chainMembers.some(
    (m) => m.id !== pokemonId && sectionSet.has(m.id) && m.generation < target.generation,
  );
  if (hasEarlierGenPlaced) {
    const hypothetical = new Set(sectionIds);
    hypothetical.delete(pokemonId);
    if (
      isChainPlacementGapFree(hypothetical, target.evolutionChainId) &&
      !hasDanglingTail(hypothetical, target.evolutionChainId)
    ) {
      return new Set([pokemonId]);
    }
  }

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

export function getEvolutionChainIds(pokemonId: number): number[] {
  const p = pokemonById.get(pokemonId);
  if (!p) return [pokemonId];
  const members = pokemonByChain.get(p.evolutionChainId) ?? [p];
  return members.map((m) => m.id);
}

export function getEvolutionLine(pokemonId: number, placedIds?: Set<number>): Pokemon[] {
  const pokemon = pokemonById.get(pokemonId);
  if (!pokemon) return [];

  const chainMembers = pokemonByChain.get(pokemon.evolutionChainId) ?? [];
  if (chainMembers.length <= 1) return [pokemon];

  const ancestors: Pokemon[] = [];
  let current: Pokemon | undefined = pokemon;
  while (current?.evolvesFrom) {
    const parent = pokemonById.get(current.evolvesFrom);
    if (parent) ancestors.unshift(parent);
    current = parent;
  }

  const descendants: Pokemon[] = [];
  let searchId = pokemon.id;
  while (true) {
    const children = chainMembers.filter(p => p.evolvesFrom === searchId);
    if (children.length === 0) break;
    const child = (placedIds && children.length > 1
      ? children.find(c => placedIds.has(c.id))
      : undefined) ?? children[0];
    descendants.push(child);
    searchId = child.id;
  }

  return [...ancestors, pokemon, ...descendants];
}

function getAllEvolutionLines(pokemonId: number): Pokemon[][] {
  const pokemon = pokemonById.get(pokemonId);
  if (!pokemon) return [];

  const chainMembers = pokemonByChain.get(pokemon.evolutionChainId) ?? [];
  if (chainMembers.length <= 1) return [[pokemon]];

  const ancestors: Pokemon[] = [];
  let current: Pokemon | undefined = pokemon;
  while (current?.evolvesFrom) {
    const parent = pokemonById.get(current.evolvesFrom);
    if (parent) ancestors.unshift(parent);
    current = parent;
  }
  const prefix = [...ancestors, pokemon];

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

export interface PokemonDataSource {
  readonly pokemon: readonly Pokemon[];
  getPokemonById(id: number): Pokemon | undefined;
  getAllEvolutionLines(id: number): Pokemon[][];
  includeEvolutionItemForms?: boolean;
  archetypeMemberId?(id: number): number;
  favoritePickerId?(id: number): number | undefined;
  compareBrowserOrder?(a: number, b: number): number;
  standaloneGroupId?(id: number): number;
}

interface UseFilteredPokemonOptions {
  dataSource?: PokemonDataSource;
  search?: string;
  category?: string | null;
  archetype?: string | null;
  types?: string[] | null;
  typeMode?: 'any' | 'all';
  generations?: number[] | null;
  shapes?: string[] | null;
  colors?: string[] | null;
  eggGroups?: string[] | null;
  excludeIds?: Set<number>;
  restrictToIds?: Set<number>;
  evoLineSize?: number[] | null;
}

function useFilteredPokemon({
  dataSource,
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
  const excludeKey = useMemo(
    () => (excludeIds ? `x:${[...excludeIds].sort((a, b) => a - b).join(',')}` : ''),
    [excludeIds]
  );
  const restrictKey = useMemo(
    () => (restrictToIds ? `r:${[...restrictToIds].sort((a, b) => a - b).join(',')}` : ''),
    [restrictToIds]
  );

  const typesKey = types ? types.join(',') : '';
  const gensKey = generations ? generations.join(',') : '';
  const shapesKey = shapes ? shapes.join(',') : '';
  const colorsKey = colors ? colors.join(',') : '';
  const eggGroupsKey = eggGroups ? eggGroups.join(',') : '';
  const namesVersion = useNamesVersion();

  return useMemo(() => {
    void namesVersion;
    const types = typesKey ? typesKey.split(',') : [];
    const generations = gensKey ? gensKey.split(',').map(Number) : [];
    const shapes = shapesKey ? shapesKey.split(',') : [];
    const colors = colorsKey ? colorsKey.split(',') : [];
    const eggGroups = eggGroupsKey ? eggGroupsKey.split(',') : [];
    const excludeIds = new Set(excludeKey.slice(2).split(',').filter(Boolean).map(Number));
    const restrictToIds = restrictKey
      ? new Set(restrictKey.slice(2).split(',').filter(Boolean).map(Number))
      : undefined;
    let filtered = dataSource ? [...dataSource.pokemon] : pokemonList;

    if (search) {
      const q = normalizeSearch(search);
      const words = q.split(/[^\p{L}\p{N}♂♀]+/u).filter(Boolean);
      filtered = filtered.filter(p => {
        if (p.name.includes(q) || p.id.toString() === q) return true;
        const full = `${p.name.replace(/-/g, ' ')} ${formSearchText(p.id) ?? ''}`;
        if (words.length && words.every(word => full.includes(word))) return true;
        const localized = speciesSearchText(p.id);
        if (localized?.includes(q)) return true;
        const resolvedFull = normalizeSearch(pokemonLabel(p.id, p.name).full);
        return words.length > 0 && words.every(word => resolvedFull.includes(word));
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
          filtered = filtered.filter(p => idSet.has(p.id) || idSet.has(dataSource?.archetypeMemberId?.(p.id) ?? p.id));
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

    if (archetype !== 'evolution-item' && !dataSource?.includeEvolutionItemForms) {
      filtered = filtered.filter(p => !EVOLUTION_ITEM_ONLY_IDS.has(p.id));
    }

    if (excludeIds && excludeIds.size > 0) {
      filtered = filtered.filter(p => !excludeIds.has(p.id));
    }

    if (restrictToIds) {
      filtered = filtered.filter(p => restrictToIds.has(p.id));
    }

    return filtered;
  }, [dataSource, search, category, archetype, typesKey, typeMode, gensKey, shapesKey, colorsKey, eggGroupsKey, excludeKey, restrictKey, namesVersion]);
}

export interface EvolutionGroup {
  chainId: number;
  members: Pokemon[];
  matchedIds: Set<number>;
}

export function useFilteredPokemonGrouped(options: UseFilteredPokemonOptions): EvolutionGroup[] {
  const filtered = useFilteredPokemon(options);
  const evoLineSizeKey = options.evoLineSize ? options.evoLineSize.join(',') : '';

  return useMemo(() => {
    const evoLineSize = evoLineSizeKey ? evoLineSizeKey.split(',').map(Number) : [];
    const filteredIds = new Set(filtered.map((p) => p.id));
    const seenBranches = new Set<string>();
    const result: EvolutionGroup[] = [];

    const hideFormAlts = options.archetype !== 'evolution-item' && !options.dataSource?.includeEvolutionItemForms;

    for (const p of filtered) {
      const lines = options.dataSource?.getAllEvolutionLines(p.id) ?? getAllEvolutionLines(p.id);

      for (const rawLine of lines) {
        const line = hideFormAlts ? rawLine.filter(m => !EVOLUTION_ITEM_ONLY_IDS.has(m.id)) : rawLine;
        if (line.length === 0) continue;

        const branchKey = line.map((m) => m.id).join('-');
        if (seenBranches.has(branchKey)) continue;
        seenBranches.add(branchKey);

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

    const compare = options.dataSource?.compareBrowserOrder ?? ((a: number, b: number) => a - b);
    result.sort((a, b) => compare(a.members[0].id, b.members[0].id));

    if (evoLineSize.length > 0) {
      const sizes = new Set(evoLineSize);
      return result.filter(group => {
        const len = group.members.length;
        if (sizes.has(3) && len >= 3) return true;
        if (sizes.has(2) && len === 2) return true;
        if (sizes.has(1) && len === 1) return true;
        return false;
      });
    }

    return result;
  }, [filtered, evoLineSizeKey, options.archetype, options.dataSource]);
}
