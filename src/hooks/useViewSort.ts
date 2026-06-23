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
  ULTRA_BEAST_IDS,
  PARADOX_IDS,
  LEGENDARY_PARADOX_IDS,
} from '@/data/categories';
import { BUILD_GROUP_IDS } from '@/data/slot-template';
import type { ViewSortOption } from '@/store/usePokedexStore';

// --- Evolution clusters ---

interface EvolutionCluster {
  chainId: number;
  members: Pokemon[];        // sorted by stage then id
  representative: Pokemon;   // lowest national dex ID in the chain
}

/** Group Pokemon IDs into evolution-chain clusters. */
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
    // Representative = lowest national dex ID in the chain
    const representative = members.reduce((best, m) => m.id < best.id ? m : best);
    clusters.push({ chainId, members, representative });
  }
  return clusters;
}

// --- Adjacency grouping ---

/**
 * Build ordered sequence of unique chain IDs as they appear in a regional dex.
 * Used to determine which chains are neighbors in the original dex.
 */
function buildDexChainSequence(gen: number): { dexChainOrder: number[]; chainToPos: Map<number, number> } | null {
  const dex = REGIONAL_DEXES.find((d) => d.generation === gen);
  if (!dex) return null;

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

  const presentChains = new Set(clusters.map((c) => c.chainId));

  // For each cluster, find its position in its generation's regional dex chain sequence
  const clusterDexInfo = new Map<number, { gen: number; pos: number }>();
  const dexCache = new Map<number, ReturnType<typeof buildDexChainSequence>>();

  for (const c of clusters) {
    const gen = c.representative.generation;
    if (!dexCache.has(gen)) {
      dexCache.set(gen, buildDexChainSequence(gen));
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

    let adjacent = false;
    if (prevInfo && currInfo && prevInfo.gen === currInfo.gen) {
      const dexInfo = dexCache.get(prevInfo.gen);
      if (dexInfo) {
        let allBetweenPresent = true;
        for (let pos = prevInfo.pos + 1; pos < currInfo.pos; pos++) {
          const betweenChainId = dexInfo.dexChainOrder[pos];
          if (!presentChains.has(betweenChainId)) {
            allBetweenPresent = false;
            break;
          }
        }
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

// --- Cluster sorting functions ---

/** Sort clusters by representative's national dex ID, with adjacency grouping. */
function sortClustersNational(ids: number[]): Pokemon[] {
  const clusters = buildClusters(ids);
  const superClusters = groupAdjacentClusters(clusters);

  superClusters.sort((a, b) => a[0].representative.id - b[0].representative.id);

  return superClusters.flatMap((sc) => sc.flatMap((c) => c.members));
}

/** Sort clusters by regional dex percentile, with adjacency grouping. */
function sortClustersRegional(ids: number[]): Pokemon[] {
  const clusters = buildClusters(ids);
  const superClusters = groupAdjacentClusters(clusters);

  const tagged = superClusters.map((sc) => ({
    superCluster: sc,
    percentile: getRegionalPercentile(sc[0].representative),
    tiebreak: sc[0].representative.id,
  }));

  tagged.sort((a, b) => {
    if (a.percentile !== b.percentile) return a.percentile - b.percentile;
    return a.tiebreak - b.tiebreak;
  });

  return tagged.flatMap((t) => t.superCluster.flatMap((c) => c.members));
}

/**
 * Sort clusters by representative's primary type, then national dex.
 * NO adjacency grouping — evo lines stay bundled but neighbor chains can split.
 */
function sortClustersType(ids: number[]): Pokemon[] {
  const clusters = buildClusters(ids);
  const typeOrder = new Map(TYPE_NAMES.map((t, i) => [t, i]));

  clusters.sort((a, b) => {
    const aType = typeOrder.get(a.representative.types[0]) ?? 999;
    const bType = typeOrder.get(b.representative.types[0]) ?? 999;
    if (aType !== bType) return aType - bType;
    return a.representative.id - b.representative.id;
  });

  return clusters.flatMap((c) => c.members);
}

/** Get regional dex percentile for a representative Pokemon. */
function getRegionalPercentile(rep: Pokemon): number {
  const dex = REGIONAL_DEXES.find((d) => d.generation === rep.generation);
  if (!dex) return 0.5;
  const idx = dex.pokemonIds.indexOf(rep.id);
  if (idx === -1) return 0.5;
  return idx / dex.pokemonIds.length;
}

// --- Bucket assignment ---

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

/**
 * 15 ordered buckets:
 *  0: Starter SECTION (build page order)
 *  1: Middle (sorted by selected sort option)
 *  2: Other fossils not in fossil section
 *  3: Fossil SECTION (build page order)
 *  4: Other official starters not in starter section
 *  5: Non-legendary Paradox Pokemon
 *  6: Other pseudo-legendaries not in pseudo section
 *  7: Pseudo-legendary SECTION (build page order)
 *  8: Ultra Beasts
 *  9: Legendary Paradox Pokemon
 * 10: Other sub-legendaries
 * 11: Other restricted legendaries
 * 12: Legendary SECTION (build page order)
 * 13: Other mythicals not in mythical section
 * 14: Mythical SECTION (build page order)
 */
const NUM_BUCKETS = 15;

// Section-based bucket indices (build page order preserved)
const SECTION_BUCKETS = new Set([0, 3, 7, 12, 14]);

function assignBucket(id: number, section: string | undefined): number {
  const p = getPokemonById(id);
  if (!p) return 1;

  // Section-based buckets
  if (section === 'starter') return 0;
  if (section === 'mythical') return 14;
  if (section === 'legendary') return 12;
  if (section === 'pseudo-legendary') return 7;
  if (section === 'fossil') return 3;

  // Category-based "other" buckets
  if (p.isMythical) return 13;
  if (RESTRICTED_LEGENDARY_IDS.has(id)) return 11;
  if (SUB_LEGENDARY_IDS.has(id)) return 10;
  if (LEGENDARY_PARADOX_IDS.has(id)) return 9;
  if (ULTRA_BEAST_IDS.has(id)) return 8;
  if (PSEUDO_LEGENDARY_IDS.has(id)) return 6;
  if (PARADOX_IDS.has(id)) return 5;
  if (STARTER_IDS.has(id)) return 4;
  if (FOSSIL_IDS.has(id)) return 2;

  return 1; // middle
}

// Map bucket index → section ID for section-based buckets
const BUCKET_TO_SECTION: Record<number, string> = {
  0: 'starter',
  3: 'fossil',
  7: 'pseudo-legendary',
  12: 'legendary',
  14: 'mythical',
};

// --- Main sorting ---

type ClusterSorter = (ids: number[]) => Pokemon[];

/**
 * Partition all placed Pokemon into 15 ordered buckets, then sort each bucket.
 * - Section buckets (0, 3, 7, 12, 14): preserve build page order
 * - Middle bucket (1): sorted by the provided middleSorter
 * - Other category buckets: cluster-sorted by the provided otherSorter
 */
function sortWithBuckets(
  sections: Record<string, number[]>,
  middleSorter: ClusterSorter,
  otherSorter: ClusterSorter,
): Pokemon[] {
  const idToSection = buildIdToSection(sections);

  const buckets: number[][] = Array.from({ length: NUM_BUCKETS }, () => []);
  for (const [id, section] of idToSection) {
    buckets[assignBucket(id, section)].push(id);
  }

  const result: Pokemon[] = [];
  for (let i = 0; i < NUM_BUCKETS; i++) {
    if (SECTION_BUCKETS.has(i)) {
      // Section bucket: preserve build page order, filter to only IDs assigned to this bucket
      const sectionId = BUCKET_TO_SECTION[i];
      const bucketSet = new Set(buckets[i]);
      for (const id of sections[sectionId] ?? []) {
        if (bucketSet.has(id)) {
          const p = getPokemonById(id);
          if (p) result.push(p);
        }
      }
    } else if (i === 1) {
      // Middle bucket: use the primary sorter
      result.push(...middleSorter(buckets[i]));
    } else {
      // Other category bucket: cluster-sorted
      result.push(...otherSorter(buckets[i]));
    }
  }
  return result;
}

/** Sort IDs by build page order (preserving placement sequence). */
function sortByBuildOrder(ids: number[], sections: Record<string, number[]>): Pokemon[] {
  // Build a position map: id → global position across all build groups
  const posMap = new Map<number, number>();
  let pos = 0;
  for (const groupId of BUILD_GROUP_IDS) {
    for (const id of sections[groupId] ?? []) {
      posMap.set(id, pos++);
    }
  }

  const idSet = new Set(ids);
  const result: Pokemon[] = [];
  // Iterate in build order, pick only those in the provided id set
  for (const groupId of BUILD_GROUP_IDS) {
    for (const id of sections[groupId] ?? []) {
      if (idSet.has(id)) {
        const p = getPokemonById(id);
        if (p) result.push(p);
      }
    }
  }
  return result;
}

/** Collect all placed Pokemon IDs across all sections, in build page order. */
function collectAllIds(sections: Record<string, number[]>): number[] {
  const ids: number[] = [];
  for (const groupId of BUILD_GROUP_IDS) {
    for (const id of sections[groupId] ?? []) {
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Reconcile a persisted custom order against the current dex contents.
 * - Drops IDs no longer in the dex.
 * - Inserts new IDs adjacent to existing line-mates (preserving stage order
 *   within the chain). If no line-mate is present, appends to the end.
 * This keeps evolution lines bundled and matches the user's intent that new
 * pokemon land roughly where they belong without destroying manual placement.
 */
function reconcileCustomOrder(
  customOrder: number[],
  currentIds: number[],
): number[] {
  const currentSet = new Set(currentIds);

  // 1. Drop removed, dedupe.
  const seen = new Set<number>();
  let next: number[] = [];
  for (const id of customOrder) {
    if (currentSet.has(id) && !seen.has(id)) {
      next.push(id);
      seen.add(id);
    }
  }

  // 2. Insert new IDs.
  for (const newId of currentIds) {
    if (seen.has(newId)) continue;

    const newPokemon = getPokemonById(newId);
    if (!newPokemon) continue;

    // Find all existing line-mates in the current `next` array.
    const chainId = newPokemon.evolutionChainId;
    const anchorIndices: number[] = [];
    for (let i = 0; i < next.length; i++) {
      const p = getPokemonById(next[i]);
      if (p && p.evolutionChainId === chainId) anchorIndices.push(i);
    }

    if (anchorIndices.length > 0) {
      // Sort all line-mates (existing + new) by (stage, id) and splice back in
      // at the position of the first existing anchor.
      const lineIds = [...anchorIndices.map((i) => next[i]), newId];
      const lineObjs = lineIds
        .map((id) => getPokemonById(id))
        .filter((p): p is NonNullable<ReturnType<typeof getPokemonById>> => !!p)
        .sort((a, b) => a.evolutionStage - b.evolutionStage || a.id - b.id);
      const sortedLineIds = lineObjs.map((p) => p.id);

      // Insert index in the "without line" array = count of non-line items
      // before the first anchor in the original next[].
      let insertIdx = 0;
      for (let i = 0; i < anchorIndices[0]; i++) {
        const p = getPokemonById(next[i]);
        if (!p || p.evolutionChainId !== chainId) insertIdx++;
      }

      const without = next.filter((id) => {
        const p = getPokemonById(id);
        return !p || p.evolutionChainId !== chainId;
      });
      without.splice(insertIdx, 0, ...sortedLineIds);
      next = without;
    } else {
      next.push(newId);
    }
    seen.add(newId);
  }

  return next;
}

export function useViewSort(
  sections: Record<string, number[]>,
  sortOption: ViewSortOption,
  groupSpecialAtEnd: boolean = true,
  customOrder: number[] | null = null,
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

  const customKey = useMemo(
    () => (customOrder ? customOrder.join(',') : 'null'),
    [customOrder],
  );

  return useMemo(() => {
    // Custom: render the reconciled customOrder verbatim. The grouping toggle
    // does NOT apply here — custom is fully freeform.
    if (sortOption === 'custom' && customOrder) {
      const allIds = collectAllIds(sections);
      const reconciled = reconcileCustomOrder(customOrder, allIds);
      return reconciled
        .map((id) => getPokemonById(id))
        .filter((p): p is Pokemon => !!p);
    }

    // When grouping is off, sort all placed Pokemon as one flat list (no buckets).
    // Starters from the user's "starter" section are always pinned to the front,
    // preserving the user's build-page order within that section. In regional sort,
    // Victini (#494) is placed ahead of the starters when present (per-user request).
    if (!groupSpecialAtEnd) {
      const allIds = collectAllIds(sections);
      const allIdSet = new Set(allIds);

      const starterIds = (sections['starter'] ?? []).filter((id) => allIdSet.has(id));
      const starterSet = new Set(starterIds);

      const victiniFirst =
        sortOption === 'regional' && allIdSet.has(494) && !starterSet.has(494);

      const excluded = new Set<number>(starterSet);
      if (victiniFirst) excluded.add(494);

      const remainingIds = allIds.filter((id) => !excluded.has(id));

      let sortedRest: Pokemon[];
      switch (sortOption) {
        case 'regional':
          sortedRest = sortClustersRegional(remainingIds);
          break;
        case 'national':
          sortedRest = sortClustersNational(remainingIds);
          break;
        case 'type':
          sortedRest = sortClustersType(remainingIds);
          break;
        case 'build-order':
          sortedRest = sortByBuildOrder(remainingIds, sections);
          break;
        default:
          sortedRest = sortClustersNational(remainingIds);
      }

      const prefix: Pokemon[] = [];
      if (victiniFirst) {
        const v = getPokemonById(494);
        if (v) prefix.push(v);
      }
      for (const id of starterIds) {
        const p = getPokemonById(id);
        if (p) prefix.push(p);
      }

      return [...prefix, ...sortedRest];
    }

    switch (sortOption) {
      case 'regional':
        // Middle: regional percentile + adjacency; Other buckets: national dex + adjacency
        return sortWithBuckets(sections, sortClustersRegional, sortClustersNational);
      case 'national':
        // Middle + Other buckets: national dex + adjacency
        return sortWithBuckets(sections, sortClustersNational, sortClustersNational);
      case 'type':
        // Middle: type sort (no adjacency); Other buckets: type sort (no adjacency)
        return sortWithBuckets(sections, sortClustersType, sortClustersType);
      case 'build-order':
        // Middle: build page order; Other buckets: national dex + adjacency
        return sortWithBuckets(
          sections,
          (ids) => sortByBuildOrder(ids, sections),
          sortClustersNational,
        );
      default:
        return sortWithBuckets(sections, sortClustersNational, sortClustersNational);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionsKey, sortOption, groupSpecialAtEnd, customKey]);
}
