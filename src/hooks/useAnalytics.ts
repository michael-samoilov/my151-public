import { useMemo } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { getPokemonById, getAllPokemon, withoutSpecials } from '@/hooks/usePokemonData';
import { TYPE_NAMES } from '@/types/pokemon';
import { STARTER_IDS } from '@/data/categories';

function buildHistogram(values: number[], binSize: number): { bin: string; count: number; pct: number }[] {
  if (values.length === 0) return [];
  const min = Math.floor(Math.min(...values) / binSize) * binSize;
  const max = Math.floor(Math.max(...values) / binSize) * binSize;
  const bins: { bin: string; count: number }[] = [];
  for (let b = min; b <= max; b += binSize) {
    bins.push({ bin: `${b}`, count: 0 });
  }
  for (const v of values) {
    const idx = Math.floor((v - min) / binSize);
    if (idx >= 0 && idx < bins.length) bins[idx].count++;
  }
  const total = values.length;
  return bins.map(b => ({ ...b, pct: (b.count / total) * 100 }));
}

interface Baseline {
  typeProp: Record<string, number>;
  genProp: Record<number, number>;
  avgBst: number;
  bstHist: { bin: string; count: number; pct: number }[];
  avgEvoLevel: number;
  evoHist: { bin: string; count: number; pct: number }[];
}

function computeBaseline(pokemon: ReturnType<typeof getAllPokemon>): Baseline {
  const total = pokemon.length;
  const typeProp: Record<string, number> = {};
  for (const t of TYPE_NAMES) typeProp[t] = 0;
  for (const p of pokemon) {
    for (const t of p.types) typeProp[t] = (typeProp[t] || 0) + 1;
  }
  for (const t of TYPE_NAMES) typeProp[t] = typeProp[t] / total;

  const genProp: Record<number, number> = {};
  for (const p of pokemon) {
    genProp[p.generation] = (genProp[p.generation] || 0) + 1;
  }
  for (const g of Object.keys(genProp)) {
    genProp[Number(g)] = genProp[Number(g)] / total;
  }

  const bsts = pokemon.map(p => p.bst);
  const avgBst = Math.round(bsts.reduce((a, b) => a + b, 0) / total);
  const bstHist = buildHistogram(bsts, 50);

  const evoLevels = pokemon.map(p => p.evolutionLevel).filter((l): l is number => l !== null);
  const avgEvoLevel = evoLevels.length > 0
    ? Math.round(evoLevels.reduce((a, b) => a + b, 0) / evoLevels.length)
    : 0;
  const evoHist = buildHistogram(evoLevels, 5);

  return { typeProp, genProp, avgBst, bstHist, avgEvoLevel, evoHist };
}

const allNational = getAllPokemon();
const fullBaseline = computeBaseline(allNational);
const filteredNational = withoutSpecials(allNational, STARTER_IDS);
const filteredBaseline = computeBaseline(filteredNational);

export { fullBaseline, filteredBaseline };

/** Analytics for a Dex's sections. Pure, so a page without the store can call it. */
export function computeAnalytics(sections: Record<string, number[]>, excludeSpecial = false) {
  const base = excludeSpecial ? filteredBaseline : fullBaseline;

  const allIds = Object.values(sections).flat();
  const starterSectionIds = new Set(sections['starter'] ?? []);

  let pokemon = allIds
    .map((id) => getPokemonById(id))
    .filter(Boolean)
    .map((p) => p!);

  if (excludeSpecial) {
    pokemon = withoutSpecials(pokemon, starterSectionIds);
  }

  const total = pokemon.length;
  if (total === 0) {
    return {
      total: 0,
      typeDistribution: [],
      typeDeviation: [],
      generationDistribution: [],
      generationDeviation: [],
      bstStats: { min: 0, max: 0, avg: 0, median: 0, averageRegion: base.avgBst },
      yourBstHistogram: [],
      nationalBstHistogram: base.bstHist,
      nationalAvgBst: base.avgBst,
      evolutionStats: { avgLevel: 0, nationalAvgLevel: base.avgEvoLevel, stageDistribution: { 1: 0, 2: 0, 3: 0 } },
      yourEvoHistogram: [],
      nationalEvoHistogram: base.evoHist,
      legendaryCount: 0,
      mythicalCount: 0,
      monoTypeCount: 0,
      dualTypeCount: 0,
    };
  }

  // Type distribution
  const typeCounts: Record<string, number> = {};
  for (const t of TYPE_NAMES) typeCounts[t] = 0;
  for (const p of pokemon) {
    for (const t of p.types) {
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
  }
  const typeDistribution = TYPE_NAMES.map((t) => ({
    type: t,
    count: typeCounts[t],
    percentage: (typeCounts[t] / total) * 100,
  }));
  const typeDeviation = TYPE_NAMES.map((t) => {
    const yourProportion = typeCounts[t] / total;
    const globalProportion = base.typeProp[t];
    const ratio = globalProportion > 0 ? yourProportion / globalProportion : 0;
    return {
      type: t,
      count: typeCounts[t],
      yourProportion,
      globalProportion,
      ratio,
      deviation: globalProportion > 0 ? (ratio - 1) * 100 : 0,
    };
  }).sort((a, b) => b.deviation - a.deviation);

  // Generation distribution
  const genCounts: Record<number, number> = {};
  for (let g = 1; g <= 9; g++) genCounts[g] = 0;
  for (const p of pokemon) {
    genCounts[p.generation] = (genCounts[p.generation] || 0) + 1;
  }
  const generationDistribution = Object.entries(genCounts).map(([gen, count]) => ({
    generation: parseInt(gen),
    count,
    percentage: (count / total) * 100,
  }));
  const generationDeviation = Object.entries(genCounts).map(([gen, count]) => {
    const g = parseInt(gen);
    const yourProportion = count / total;
    const globalProportion = base.genProp[g] || 0;
    const ratio = globalProportion > 0 ? yourProportion / globalProportion : 0;
    return {
      generation: g,
      count,
      yourProportion,
      globalProportion,
      ratio,
      deviation: globalProportion > 0 ? (ratio - 1) * 100 : 0,
    };
  });

  // BST stats + histogram
  const bsts = pokemon.map((p) => p.bst).sort((a, b) => a - b);
  const bstStats = {
    min: bsts[0],
    max: bsts[bsts.length - 1],
    avg: Math.round(bsts.reduce((a, b) => a + b, 0) / total),
    median: bsts[Math.floor(total / 2)],
    averageRegion: base.avgBst,
  };
  const yourBstHistogram = buildHistogram(bsts, 50);

  // Evolution stats + histogram
  const evoLevels = pokemon
    .map((p) => p.evolutionLevel)
    .filter((l): l is number => l !== null);
  const avgEvoLevel = evoLevels.length
    ? Math.round(evoLevels.reduce((a, b) => a + b, 0) / evoLevels.length)
    : 0;
  const yourEvoHistogram = buildHistogram(evoLevels, 5);
  const stageCounts = { 1: 0, 2: 0, 3: 0 };
  for (const p of pokemon) {
    stageCounts[p.evolutionStage]++;
  }

  return {
    total,
    typeDistribution,
    typeDeviation,
    generationDistribution,
    generationDeviation,
    bstStats,
    yourBstHistogram,
    nationalBstHistogram: base.bstHist,
    nationalAvgBst: base.avgBst,
    evolutionStats: {
      avgLevel: avgEvoLevel,
      nationalAvgLevel: base.avgEvoLevel,
      stageDistribution: stageCounts,
    },
    yourEvoHistogram,
    nationalEvoHistogram: base.evoHist,
    legendaryCount: pokemon.filter((p) => p.isLegendary).length,
    mythicalCount: pokemon.filter((p) => p.isMythical).length,
    monoTypeCount: pokemon.filter((p) => p.types.length === 1).length,
    dualTypeCount: pokemon.filter((p) => p.types.length === 2).length,
  };
}

export function useAnalytics(excludeSpecial = false) {
  const sections = usePokedexStore((s) => s.sections);
  return useMemo(() => computeAnalytics(sections, excludeSpecial), [sections, excludeSpecial]);
}
