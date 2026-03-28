import { useMemo } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { getPokemonById, getAllPokemon } from '@/hooks/usePokemonData';
import { TYPE_NAMES, type TypeName } from '@/types/pokemon';

// Average type distribution across official regions (approximate percentages)
const AVERAGE_TYPE_DISTRIBUTION: Record<TypeName, number> = {
  normal: 11, fire: 6.5, water: 9, electric: 5, grass: 7, ice: 3.5,
  fighting: 4.5, poison: 5.5, ground: 5, flying: 7.5, psychic: 5.5, bug: 7,
  rock: 4.5, ghost: 3.5, dragon: 3, dark: 4, steel: 4, fairy: 4,
};

// Average generation source distribution (what % of a typical regional dex comes from each gen)
const AVERAGE_GEN_DISTRIBUTION: Record<number, number> = {
  1: 18, 2: 12, 3: 12, 4: 11, 5: 12, 6: 9, 7: 9, 8: 9, 9: 8,
};

// Average BST by section of dex
const AVERAGE_BST = 420;

// Precompute national dex histograms (static, computed once)
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

const allNational = getAllPokemon();
const nationalEvoLevels = allNational.map(p => p.evolutionLevel).filter((l): l is number => l !== null);
const nationalAvgEvoLevel = nationalEvoLevels.length > 0
  ? Math.round(nationalEvoLevels.reduce((a, b) => a + b, 0) / nationalEvoLevels.length)
  : 0;
const nationalEvoHistogram = buildHistogram(nationalEvoLevels, 5);
const nationalBsts = allNational.map(p => p.bst);
const nationalAvgBst = Math.round(nationalBsts.reduce((a, b) => a + b, 0) / nationalBsts.length);
const nationalBstHistogram = buildHistogram(nationalBsts, 50);

export function useAnalytics() {
  const sections = usePokedexStore((s) => s.sections);

  return useMemo(() => {
    const allIds = Object.values(sections).flat();
    const pokemon = allIds
      .map((id) => getPokemonById(id))
      .filter(Boolean)
      .map((p) => p!);

    const total = pokemon.length;
    if (total === 0) {
      return {
        total: 0,
        typeDistribution: [],
        typeDeviation: [],
        generationDistribution: [],
        generationDeviation: [],
        bstStats: { min: 0, max: 0, avg: 0, median: 0, averageRegion: AVERAGE_BST },
        yourBstHistogram: [],
        nationalBstHistogram,
        nationalAvgBst,
        evolutionStats: { avgLevel: 0, nationalAvgLevel: nationalAvgEvoLevel, stageDistribution: { 1: 0, 2: 0, 3: 0 } },
        yourEvoHistogram: [],
        nationalEvoHistogram,
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
      const yourPct = (typeCounts[t] / total) * 100;
      const avgPct = AVERAGE_TYPE_DISTRIBUTION[t];
      return {
        type: t,
        yours: yourPct,
        average: avgPct,
        ratio: avgPct > 0 ? yourPct / avgPct : 0,
      };
    }).sort((a, b) => b.ratio - a.ratio);

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
      const yourPct = (count / total) * 100;
      const avgPct = AVERAGE_GEN_DISTRIBUTION[parseInt(gen)] || 0;
      return {
        generation: parseInt(gen),
        yours: yourPct,
        average: avgPct,
        ratio: avgPct > 0 ? yourPct / avgPct : 0,
      };
    });

    // BST stats + histogram
    const bsts = pokemon.map((p) => p.bst).sort((a, b) => a - b);
    const bstStats = {
      min: bsts[0],
      max: bsts[bsts.length - 1],
      avg: Math.round(bsts.reduce((a, b) => a + b, 0) / total),
      median: bsts[Math.floor(total / 2)],
      averageRegion: AVERAGE_BST,
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
      nationalBstHistogram,
      nationalAvgBst,
      evolutionStats: {
        avgLevel: avgEvoLevel,
        nationalAvgLevel: nationalAvgEvoLevel,
        stageDistribution: stageCounts,
      },
      yourEvoHistogram,
      nationalEvoHistogram,
      legendaryCount: pokemon.filter((p) => p.isLegendary).length,
      mythicalCount: pokemon.filter((p) => p.isMythical).length,
      monoTypeCount: pokemon.filter((p) => p.types.length === 1).length,
      dualTypeCount: pokemon.filter((p) => p.types.length === 2).length,
    };
  }, [sections]);
}
