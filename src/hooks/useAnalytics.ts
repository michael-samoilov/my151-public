import { useMemo } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { getPokemonById, getAllPokemon } from '@/hooks/usePokemonData';
import { TYPE_NAMES } from '@/types/pokemon';

// Precompute national dex stats (static, computed once)
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
const nationalTotal = allNational.length;

// National type proportions: what fraction of all Pokemon have each type
// (dual-types count for both, so proportions sum > 100%, which is correct)
const nationalTypeProportion: Record<string, number> = {};
for (const t of TYPE_NAMES) nationalTypeProportion[t] = 0;
for (const p of allNational) {
  for (const t of p.types) {
    nationalTypeProportion[t] = (nationalTypeProportion[t] || 0) + 1;
  }
}
// Convert counts to proportions (fraction of Pokemon that have this type)
for (const t of TYPE_NAMES) {
  nationalTypeProportion[t] = nationalTypeProportion[t] / nationalTotal;
}

// National generation proportions: fraction of all Pokemon from each gen
const nationalGenProportion: Record<number, number> = {};
for (const p of allNational) {
  nationalGenProportion[p.generation] = (nationalGenProportion[p.generation] || 0) + 1;
}
for (const g of Object.keys(nationalGenProportion)) {
  nationalGenProportion[Number(g)] = nationalGenProportion[Number(g)] / nationalTotal;
}

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
        bstStats: { min: 0, max: 0, avg: 0, median: 0, averageRegion: nationalAvgBst },
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
    // Deviation: (your proportion / national proportion) - 1, as percentage
    // 0% = same, +100% = double, -50% = half
    const typeDeviation = TYPE_NAMES.map((t) => {
      const yourProportion = typeCounts[t] / total;
      const globalProportion = nationalTypeProportion[t];
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
      const globalProportion = nationalGenProportion[g] || 0;
      const ratio = globalProportion > 0 ? yourProportion / globalProportion : 0;
      return {
        generation: g,
        count,
        yourProportion,
        globalProportion,
        ratio,
        deviation: globalProportion > 0 ? (ratio - 1) * 100 : 0,
      };
    }).sort((a, b) => b.deviation - a.deviation);

    // BST stats + histogram
    const bsts = pokemon.map((p) => p.bst).sort((a, b) => a - b);
    const bstStats = {
      min: bsts[0],
      max: bsts[bsts.length - 1],
      avg: Math.round(bsts.reduce((a, b) => a + b, 0) / total),
      median: bsts[Math.floor(total / 2)],
      averageRegion: nationalAvgBst,
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
