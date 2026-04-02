import { useMemo } from 'react';
import type { Pokemon } from '@/types/pokemon';
import { TYPE_NAMES } from '@/types/pokemon';
import { getPokemonById } from '@/hooks/usePokemonData';
import { REGIONAL_DEXES } from '@/data/regional-dexes';
import {
  STARTER_IDS,
  FOSSIL_IDS,
  PSEUDO_LEGENDARY_IDS,
  SUB_LEGENDARY_IDS,
  RESTRICTED_LEGENDARY_IDS,
} from '@/data/categories';
import { BUILD_GROUP_IDS } from '@/data/slot-template';
import type { ViewSortOption } from '@/store/usePokedexStore';

interface EvolutionCluster {
  chainId: number;
  members: Pokemon[];
  representative: Pokemon;
}

/** Assign a pinned-group rank to a cluster. Lower rank = earlier in output. */
function getPinnedGroup(cluster: EvolutionCluster): number {
  const ids = cluster.members.map((m) => m.id);
  if (ids.some((id) => STARTER_IDS.has(id))) return 0;
  if (cluster.members.some((m) => m.isMythical)) return 6;
  if (ids.some((id) => RESTRICTED_LEGENDARY_IDS.has(id))) return 5;
  if (ids.some((id) => SUB_LEGENDARY_IDS.has(id))) return 4;
  if (ids.some((id) => PSEUDO_LEGENDARY_IDS.has(id))) return 3;
  if (ids.some((id) => FOSSIL_IDS.has(id))) return 2;
  return 1; // middle group — sorted by regional dex percentile
}

/** Get regional dex percentile for a representative Pokemon. */
function getRegionalPercentile(rep: Pokemon): number {
  const dex = REGIONAL_DEXES.find((d) => d.generation === rep.generation);
  if (!dex) return 0.5;
  const idx = dex.pokemonIds.indexOf(rep.id);
  if (idx === -1) return 0.5;
  return idx / dex.pokemonIds.length;
}

/** Build evolution-chain clusters from a list of Pokemon IDs. */
function buildClusters(pokemonIds: number[]): EvolutionCluster[] {
  const chainMap = new Map<number, Pokemon[]>();

  for (const id of pokemonIds) {
    const p = getPokemonById(id);
    if (!p) continue;
    const existing = chainMap.get(p.evolutionChainId) ?? [];
    existing.push(p);
    chainMap.set(p.evolutionChainId, existing);
  }

  const clusters: EvolutionCluster[] = [];
  for (const [chainId, members] of chainMap) {
    // Sort members by evolution stage, then id
    members.sort((a, b) => a.evolutionStage - b.evolutionStage || a.id - b.id);
    // Representative: earliest generation, tiebreak lowest id
    const representative = members.reduce((best, m) =>
      m.generation < best.generation || (m.generation === best.generation && m.id < best.id) ? m : best
    );
    clusters.push({ chainId, members, representative });
  }

  return clusters;
}

/** Sort by regional dex percentile with pinned category groups. */
function sortRegional(pokemonIds: number[]): Pokemon[] {
  const clusters = buildClusters(pokemonIds);

  // Assign groups and sort
  const tagged = clusters.map((c) => ({
    cluster: c,
    group: getPinnedGroup(c),
    percentile: getRegionalPercentile(c.representative),
  }));

  tagged.sort((a, b) => {
    // Primary: group rank
    if (a.group !== b.group) return a.group - b.group;
    // Middle group: sort by percentile
    if (a.group === 1) {
      if (a.percentile !== b.percentile) return a.percentile - b.percentile;
    }
    // Tiebreak: representative national dex number
    return a.cluster.representative.id - b.cluster.representative.id;
  });

  return tagged.flatMap((t) => t.cluster.members);
}

/** Sort by national dex number. */
function sortNational(pokemonIds: number[]): Pokemon[] {
  const pokemon: Pokemon[] = [];
  for (const id of pokemonIds) {
    const p = getPokemonById(id);
    if (p) pokemon.push(p);
  }
  pokemon.sort((a, b) => a.id - b.id);
  return pokemon;
}

/** Sort by primary type (TYPE_NAMES order), then national dex within each type. */
function sortByType(pokemonIds: number[]): Pokemon[] {
  const pokemon: Pokemon[] = [];
  for (const id of pokemonIds) {
    const p = getPokemonById(id);
    if (p) pokemon.push(p);
  }

  const typeOrder = new Map(TYPE_NAMES.map((t, i) => [t, i]));

  pokemon.sort((a, b) => {
    const aType = typeOrder.get(a.types[0]) ?? 999;
    const bType = typeOrder.get(b.types[0]) ?? 999;
    if (aType !== bType) return aType - bType;
    return a.id - b.id;
  });

  return pokemon;
}

/** Sort by build page section order. */
function sortBuildOrder(sections: Record<string, number[]>): Pokemon[] {
  const result: Pokemon[] = [];
  for (const groupId of BUILD_GROUP_IDS) {
    const ids = sections[groupId] ?? [];
    for (const id of ids) {
      const p = getPokemonById(id);
      if (p) result.push(p);
    }
  }
  return result;
}

/** Collect all placed Pokemon IDs from sections. */
function getAllPlacedIds(sections: Record<string, number[]>): number[] {
  const ids: number[] = [];
  for (const groupId of BUILD_GROUP_IDS) {
    const sectionIds = sections[groupId] ?? [];
    ids.push(...sectionIds);
  }
  return ids;
}

export function useViewSort(
  sections: Record<string, number[]>,
  sortOption: ViewSortOption
): Pokemon[] {
  // Serialize sections to a stable key for memo
  const sectionsKey = useMemo(() => {
    const parts: string[] = [];
    for (const groupId of BUILD_GROUP_IDS) {
      const ids = sections[groupId];
      if (ids && ids.length > 0) {
        parts.push(`${groupId}:${ids.join(',')}`);
      }
    }
    return parts.join('|');
  }, [sections]);

  return useMemo(() => {
    if (sortOption === 'build-order') {
      return sortBuildOrder(sections);
    }
    const allIds = getAllPlacedIds(sections);
    switch (sortOption) {
      case 'regional':
        return sortRegional(allIds);
      case 'national':
        return sortNational(allIds);
      case 'type':
        return sortByType(allIds);
      default:
        return sortNational(allIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionsKey, sortOption]);
}
