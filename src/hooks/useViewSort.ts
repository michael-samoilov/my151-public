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

// --- Helpers ---

/** Build a reverse map: pokemonId → sectionId */
function buildIdToSection(sections: Record<string, number[]>): Map<number, string> {
  const map = new Map<number, string>();
  for (const groupId of BUILD_GROUP_IDS) {
    for (const id of sections[groupId] ?? []) {
      map.set(id, groupId);
    }
  }
  return map;
}

/** Resolve Pokemon IDs to Pokemon objects, preserving order. */
function resolve(ids: number[]): Pokemon[] {
  const result: Pokemon[] = [];
  for (const id of ids) {
    const p = getPokemonById(id);
    if (p) result.push(p);
  }
  return result;
}

/** Sort Pokemon by national dex number. */
function byNationalDex(a: Pokemon, b: Pokemon): number {
  return a.id - b.id;
}

// --- Bucket assignment ---

/**
 * 12 ordered buckets for the regional/national/type sorts:
 *  0: Starter SECTION (build page order)
 *  1: Middle (sorted by selected sort option)
 *  2: Other fossils not in fossil section (national dex)
 *  3: Fossil SECTION (build page order)
 *  4: Other official starters not in starter section (national dex)
 *  5: Other pseudo-legendaries not in pseudo section (national dex)
 *  6: Pseudo-legendary SECTION (build page order)
 *  7: Other sub-legendaries (national dex)
 *  8: Other restricted legendaries (national dex)
 *  9: Legendary SECTION (build page order)
 * 10: Other mythicals not in mythical section (national dex)
 * 11: Mythical SECTION (build page order)
 */
function assignBucket(id: number, section: string | undefined): number {
  const p = getPokemonById(id);
  if (!p) return 1;

  // Section-based buckets (check which build section the Pokemon is placed in)
  if (section === 'starter') return 0;
  if (section === 'mythical') return 11;
  if (section === 'legendary') return 9;
  if (section === 'pseudo-legendary') return 6;
  if (section === 'fossil') return 3;

  // Category-based "other" buckets (officially classified but placed elsewhere)
  if (p.isMythical) return 10;
  if (RESTRICTED_LEGENDARY_IDS.has(id)) return 8;
  if (SUB_LEGENDARY_IDS.has(id)) return 7;
  if (PSEUDO_LEGENDARY_IDS.has(id)) return 5;
  if (STARTER_IDS.has(id)) return 4;
  if (FOSSIL_IDS.has(id)) return 2;

  return 1; // middle
}

// --- Regional dex percentile (for middle bucket) ---

interface EvolutionCluster {
  chainId: number;
  members: Pokemon[];
  representative: Pokemon;
}

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
    members.sort((a, b) => a.evolutionStage - b.evolutionStage || a.id - b.id);
    const representative = members.reduce((best, m) =>
      m.generation < best.generation || (m.generation === best.generation && m.id < best.id) ? m : best
    );
    clusters.push({ chainId, members, representative });
  }
  return clusters;
}

/** Get regional dex percentile for a representative Pokemon. */
function getRegionalPercentile(rep: Pokemon): number {
  const dex = REGIONAL_DEXES.find((d) => d.generation === rep.generation);
  if (!dex) return 0.5;
  const idx = dex.pokemonIds.indexOf(rep.id);
  if (idx === -1) return 0.5;
  return idx / dex.pokemonIds.length;
}

/**
 * Build a map of chainId → position in the regional dex's chain sequence.
 * Two clusters are "dex-adjacent" if their chain positions are consecutive
 * in the same regional dex and both are present in our placed set.
 */
function buildDexChainSequence(rep: Pokemon): { dexChainOrder: number[]; chainToPos: Map<number, number> } | null {
  const dex = REGIONAL_DEXES.find((d) => d.generation === rep.generation);
  if (!dex) return null;

  // Build ordered sequence of unique chain IDs as they appear in the dex
  const dexChainOrder: number[] = [];
  const chainToPos = new Map<number, number>();
  for (const pokemonId of dex.pokemonIds) {
    const p = getPokemonById(pokemonId);
    if (!p) continue;
    if (!chainToPos.has(p.evolutionChainId)) {
      chainToPos.set(p.evolutionChainId, dexChainOrder.length);
      dexChainOrder.push(p.evolutionChainId);
    }
  }
  return { dexChainOrder, chainToPos };
}

/**
 * Group clusters that are adjacent in their original regional dex into super-clusters.
 * Adjacent chains must stay in an unbroken sequence.
 */
function groupAdjacentClusters(clusters: EvolutionCluster[]): EvolutionCluster[][] {
  if (clusters.length === 0) return [];

  // Build a set of chain IDs we have
  const presentChains = new Set(clusters.map((c) => c.chainId));

  // For each cluster, find its position in its generation's regional dex chain sequence
  const clusterDexInfo = new Map<number, { gen: number; pos: number }>();
  // Cache dex chain sequences by generation
  const dexCache = new Map<number, ReturnType<typeof buildDexChainSequence>>();

  for (const c of clusters) {
    const gen = c.representative.generation;
    if (!dexCache.has(gen)) {
      dexCache.set(gen, buildDexChainSequence(c.representative));
    }
    const dexInfo = dexCache.get(gen);
    if (dexInfo) {
      const pos = dexInfo.chainToPos.get(c.chainId);
      if (pos !== undefined) {
        clusterDexInfo.set(c.chainId, { gen, pos });
      }
    }
  }

  // Sort clusters by (generation, dex position) so adjacent ones are next to each other
  const sorted = [...clusters].sort((a, b) => {
    const aInfo = clusterDexInfo.get(a.chainId);
    const bInfo = clusterDexInfo.get(b.chainId);
    if (!aInfo && !bInfo) return a.representative.id - b.representative.id;
    if (!aInfo) return 1;
    if (!bInfo) return -1;
    if (aInfo.gen !== bInfo.gen) return aInfo.gen - bInfo.gen;
    return aInfo.pos - bInfo.pos;
  });

  // Group consecutive clusters that are truly adjacent in the same dex
  const superClusters: EvolutionCluster[][] = [];
  let currentGroup: EvolutionCluster[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevInfo = clusterDexInfo.get(prev.chainId);
    const currInfo = clusterDexInfo.get(curr.chainId);

    // Check if they're in the same generation's dex and truly adjacent
    // "Truly adjacent" = no other placed chains between them in the dex
    let adjacent = false;
    if (prevInfo && currInfo && prevInfo.gen === currInfo.gen) {
      const dexInfo = dexCache.get(prevInfo.gen);
      if (dexInfo) {
        // Check all positions between prev and curr — if any present chain is between them, they're not directly adjacent to each other (they'd be adjacent to the in-between chain instead)
        let allBetweenPresent = true;
        for (let pos = prevInfo.pos + 1; pos < currInfo.pos; pos++) {
          const betweenChainId = dexInfo.dexChainOrder[pos];
          if (presentChains.has(betweenChainId)) {
            // There's a placed chain between them — they'll be grouped via that chain
          } else {
            allBetweenPresent = false;
          }
        }
        // Adjacent if positions differ by exactly 1, OR all chains between them are also present
        adjacent = currInfo.pos === prevInfo.pos + 1 ||
          (currInfo.pos > prevInfo.pos && allBetweenPresent);
      }
    }

    if (adjacent) {
      currentGroup.push(curr);
    } else {
      superClusters.push(currentGroup);
      currentGroup = [curr];
    }
  }
  superClusters.push(currentGroup);

  return superClusters;
}

/** Sort middle-bucket Pokemon by regional dex percentile with adjacency grouping. */
function sortMiddleRegional(middleIds: number[]): Pokemon[] {
  const clusters = buildClusters(middleIds);
  const superClusters = groupAdjacentClusters(clusters);

  // Sort super-clusters by the first cluster's percentile
  const tagged = superClusters.map((sc) => ({
    superCluster: sc,
    percentile: getRegionalPercentile(sc[0].representative),
    tiebreak: sc[0].representative.id,
  }));

  tagged.sort((a, b) => {
    if (a.percentile !== b.percentile) return a.percentile - b.percentile;
    return a.tiebreak - b.tiebreak;
  });

  return tagged.flatMap((t) =>
    t.superCluster.flatMap((c) => c.members)
  );
}

// --- Main sorting ---

/**
 * Partition all placed Pokemon into 12 ordered buckets, then sort each bucket
 * according to its rules.
 */
function sortWithBuckets(
  sections: Record<string, number[]>,
  middleSorter: (ids: number[]) => Pokemon[]
): Pokemon[] {
  const idToSection = buildIdToSection(sections);

  // 12 buckets: indices match the bucket numbers in assignBucket
  const buckets: number[][] = Array.from({ length: 12 }, () => []);

  for (const [id, section] of idToSection) {
    const bucket = assignBucket(id, section);
    buckets[bucket].push(id);
  }

  // Bucket 0: starter section — build page order (preserved from sections)
  const b0 = resolve(sections['starter'] ?? []);

  // Bucket 1: middle — sorted by the provided sorter
  const b1 = middleSorter(buckets[1]);

  // Bucket 2: other fossils — national dex
  const b2 = resolve(buckets[2]).sort(byNationalDex);

  // Bucket 3: fossil section — build page order
  const b3 = resolve(sections['fossil'] ?? []).filter((p) => buckets[3].includes(p.id));

  // Bucket 4: other starters — national dex
  const b4 = resolve(buckets[4]).sort(byNationalDex);

  // Bucket 5: other pseudo-legendaries — national dex
  const b5 = resolve(buckets[5]).sort(byNationalDex);

  // Bucket 6: pseudo section — build page order
  const b6 = resolve(sections['pseudo-legendary'] ?? []).filter((p) => buckets[6].includes(p.id));

  // Bucket 7: other sub-legendaries — national dex
  const b7 = resolve(buckets[7]).sort(byNationalDex);

  // Bucket 8: other restricted legendaries — national dex
  const b8 = resolve(buckets[8]).sort(byNationalDex);

  // Bucket 9: legendary section — build page order
  const b9 = resolve(sections['legendary'] ?? []).filter((p) => buckets[9].includes(p.id));

  // Bucket 10: other mythicals — national dex
  const b10 = resolve(buckets[10]).sort(byNationalDex);

  // Bucket 11: mythical section — build page order
  const b11 = resolve(sections['mythical'] ?? []);

  return [...b0, ...b1, ...b2, ...b3, ...b4, ...b5, ...b6, ...b7, ...b8, ...b9, ...b10, ...b11];
}

/** Sort by national dex number. */
function sortNational(ids: number[]): Pokemon[] {
  return resolve(ids).sort(byNationalDex);
}

/** Sort by primary type (TYPE_NAMES order), then national dex within each type. */
function sortByType(ids: number[]): Pokemon[] {
  const pokemon = resolve(ids);
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
    for (const id of sections[groupId] ?? []) {
      const p = getPokemonById(id);
      if (p) result.push(p);
    }
  }
  return result;
}

export function useViewSort(
  sections: Record<string, number[]>,
  sortOption: ViewSortOption
): Pokemon[] {
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

    // All non-build-order sorts use the bucket system
    switch (sortOption) {
      case 'regional':
        return sortWithBuckets(sections, sortMiddleRegional);
      case 'national':
        return sortWithBuckets(sections, sortNational);
      case 'type':
        return sortWithBuckets(sections, sortByType);
      default:
        return sortWithBuckets(sections, sortNational);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionsKey, sortOption]);
}
