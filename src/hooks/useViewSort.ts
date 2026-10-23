import { useMemo } from 'react';
import type { Pokemon } from '@/types/pokemon';
import { TYPE_NAMES } from '@/types/pokemon';
import { getPokemonById, getAllPokemon } from '@/hooks/usePokemonData';
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
    const representative = members.reduce((best, m) => m.id < best.id ? m : best);
    clusters.push({ chainId, members, representative });
  }
  return clusters;
}

const VICTINI_ID = 494;

const ALT_FORM_ID_FLOOR = 10000;

interface GenIndex {
  ids: number[];
  idToPos: Map<number, number>;
  chainOrder: number[];
  chainToPos: Map<number, number>;
}
let _genIndex: Map<number, GenIndex> | null = null;
function genIndexFor(gen: number): GenIndex | null {
  if (!_genIndex) {
    const byGen = new Map<number, Pokemon[]>();
    for (const p of getAllPokemon()) {
      if (p.id >= ALT_FORM_ID_FLOOR) continue;
      if (p.id === VICTINI_ID) continue;
      const arr = byGen.get(p.generation);
      if (arr) arr.push(p);
      else byGen.set(p.generation, [p]);
    }
    _genIndex = new Map();
    for (const [g, list] of byGen) {
      list.sort((a, b) => a.id - b.id);
      const ids = list.map((p) => p.id);
      const idToPos = new Map(ids.map((id, i) => [id, i] as const));
      const chainOrder: number[] = [];
      const chainToPos = new Map<number, number>();
      for (const p of list) {
        if (!chainToPos.has(p.evolutionChainId)) {
          chainToPos.set(p.evolutionChainId, chainOrder.length);
          chainOrder.push(p.evolutionChainId);
        }
      }
      _genIndex.set(g, { ids, idToPos, chainOrder, chainToPos });
    }
  }
  return _genIndex.get(gen) ?? null;
}

function buildDexChainSequence(gen: number): { dexChainOrder: number[]; chainToPos: Map<number, number> } | null {
  const gi = genIndexFor(gen);
  if (!gi) return null;
  return { dexChainOrder: gi.chainOrder, chainToPos: gi.chainToPos };
}

function groupAdjacentClusters(clusters: EvolutionCluster[]): EvolutionCluster[][] {
  if (clusters.length === 0) return [];

  const presentChains = new Set(clusters.map((c) => c.chainId));

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

  const sorted = [...clusters].sort((a, b) => {
    const aInfo = clusterDexInfo.get(a.chainId);
    const bInfo = clusterDexInfo.get(b.chainId);
    if (!aInfo && !bInfo) return a.representative.id - b.representative.id;
    if (!aInfo) return 1;
    if (!bInfo) return -1;
    if (aInfo.gen !== bInfo.gen) return aInfo.gen - bInfo.gen;
    return aInfo.pos - bInfo.pos;
  });

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

function sortClustersNational(ids: number[]): Pokemon[] {
  const clusters = buildClusters(ids);
  const superClusters = groupAdjacentClusters(clusters);

  superClusters.sort((a, b) => a[0].representative.id - b[0].representative.id);

  return superClusters.flatMap((sc) => sc.flatMap((c) => c.members));
}

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

function getRegionalPercentile(rep: Pokemon): number {
  if (rep.id === VICTINI_ID) return -1;
  const gi = genIndexFor(rep.generation);
  if (!gi || gi.ids.length <= 1) return 0;
  const pos = gi.idToPos.get(rep.id);
  if (pos === undefined) return 0.5;
  return pos / (gi.ids.length - 1);
}

export function buildIdToSection(sections: Record<string, number[]>): Map<number, string> {
  const map = new Map<number, string>();
  for (const groupId of BUILD_GROUP_IDS) {
    for (const id of sections[groupId] ?? []) {
      map.set(id, groupId);
    }
  }
  return map;
}

const NUM_BUCKETS = 15;

const SECTION_BUCKETS = new Set([0, 3, 7, 12, 14]);

function assignBucket(id: number, section: string | undefined): number {
  const p = getPokemonById(id);
  if (!p) return 1;

  if (section === 'starter') return 0;
  if (section === 'mythical') return 14;
  if (section === 'legendary') return 12;
  if (section === 'pseudo-legendary') return 7;
  if (section === 'fossil') return 3;

  if (p.isMythical) return 13;
  if (RESTRICTED_LEGENDARY_IDS.has(id)) return 11;
  if (SUB_LEGENDARY_IDS.has(id)) return 10;
  if (LEGENDARY_PARADOX_IDS.has(id)) return 9;
  if (ULTRA_BEAST_IDS.has(id)) return 8;
  if (PSEUDO_LEGENDARY_IDS.has(id)) return 6;
  if (PARADOX_IDS.has(id)) return 5;
  if (STARTER_IDS.has(id)) return 4;
  if (FOSSIL_IDS.has(id)) return 2;

  return 1;
}

const BUCKET_TO_SECTION: Record<number, string> = {
  0: 'starter',
  3: 'fossil',
  7: 'pseudo-legendary',
  12: 'legendary',
  14: 'mythical',
};

type ClusterSorter = (ids: number[]) => Pokemon[];

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
      const sectionId = BUCKET_TO_SECTION[i];
      const bucketSet = new Set(buckets[i]);
      for (const id of sections[sectionId] ?? []) {
        if (bucketSet.has(id)) {
          const p = getPokemonById(id);
          if (p) result.push(p);
        }
      }
    } else if (i === 1) {
      result.push(...middleSorter(buckets[i]));
    } else {
      result.push(...otherSorter(buckets[i]));
    }
  }
  return result;
}

function sortByBuildOrder(ids: number[], sections: Record<string, number[]>): Pokemon[] {
  const posMap = new Map<number, number>();
  let pos = 0;
  for (const groupId of BUILD_GROUP_IDS) {
    for (const id of sections[groupId] ?? []) {
      posMap.set(id, pos++);
    }
  }

  const idSet = new Set(ids);
  const result: Pokemon[] = [];
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

function collectAllIds(sections: Record<string, number[]>): number[] {
  const ids: number[] = [];
  for (const groupId of BUILD_GROUP_IDS) {
    for (const id of sections[groupId] ?? []) {
      ids.push(id);
    }
  }
  return ids;
}

function reconcileCustomOrder(
  customOrder: number[],
  currentIds: number[],
): number[] {
  const currentSet = new Set(currentIds);

  const seen = new Set<number>();
  let next: number[] = [];
  for (const id of customOrder) {
    if (currentSet.has(id) && !seen.has(id)) {
      next.push(id);
      seen.add(id);
    }
  }

  for (const newId of currentIds) {
    if (seen.has(newId)) continue;

    const newPokemon = getPokemonById(newId);
    if (!newPokemon) continue;

    const chainId = newPokemon.evolutionChainId;
    const anchorIndices: number[] = [];
    for (let i = 0; i < next.length; i++) {
      const p = getPokemonById(next[i]);
      if (p && p.evolutionChainId === chainId) anchorIndices.push(i);
    }

    if (anchorIndices.length > 0) {
      const lineIds = [...anchorIndices.map((i) => next[i]), newId];
      const lineObjs = lineIds
        .map((id) => getPokemonById(id))
        .filter((p): p is NonNullable<ReturnType<typeof getPokemonById>> => !!p)
        .sort((a, b) => a.evolutionStage - b.evolutionStage || a.id - b.id);
      const sortedLineIds = lineObjs.map((p) => p.id);

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

  return useMemo(
    () => {
      const snapshot: Record<string, number[]> = {};
      for (const part of sectionsKey.split('|')) {
        if (!part) continue;
        const [groupId, ids] = part.split(':');
        snapshot[groupId] = ids.split(',').map(Number);
      }
      const order = customKey === 'null' ? null : customKey ? customKey.split(',').map(Number) : [];
      return computeViewSort(snapshot, sortOption, groupSpecialAtEnd, order);
    },
    [sectionsKey, sortOption, groupSpecialAtEnd, customKey],
  );
}

export function computeViewSort(
  sections: Record<string, number[]>,
  sortOption: ViewSortOption,
  groupSpecialAtEnd: boolean = true,
  customOrder: number[] | null = null,
): Pokemon[] {
  if (sortOption === 'custom' && customOrder) {
    const allIds = collectAllIds(sections);
    const reconciled = reconcileCustomOrder(customOrder, allIds);
    return reconciled
      .map((id) => getPokemonById(id))
      .filter((p): p is Pokemon => !!p);
  }

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
      return sortWithBuckets(sections, sortClustersRegional, sortClustersNational);
    case 'national':
      return sortWithBuckets(sections, sortClustersNational, sortClustersNational);
    case 'type':
      return sortWithBuckets(sections, sortClustersType, sortClustersType);
    case 'build-order':
      return sortWithBuckets(
        sections,
        (ids) => sortByBuildOrder(ids, sections),
        sortClustersNational,
      );
    default:
      return sortWithBuckets(sections, sortClustersNational, sortClustersNational);
  }
}
