import { useMemo } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { getPokemonById } from '@/hooks/usePokemonData';
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
const AVERAGE_EVOLUTION_LEVEL = 30;

export function useAnalytics() {
  const slots = usePokedexStore((s) => s.slots);

  return useMemo(() => {
    const pokemon = slots
      .filter((s) => s.pokemonId !== null)
      .map((s) => getPokemonById(s.pokemonId!))
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
        evolutionStats: { avgLevel: 0, averageRegionLevel: AVERAGE_EVOLUTION_LEVEL, stageDistribution: { 1: 0, 2: 0, 3: 0 } },
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
    const typeDeviation = TYPE_NAMES.map((t) => ({
      type: t,
      yours: (typeCounts[t] / total) * 100,
      average: AVERAGE_TYPE_DISTRIBUTION[t],
      deviation: (typeCounts[t] / total) * 100 - AVERAGE_TYPE_DISTRIBUTION[t],
    }));

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
    const generationDeviation = Object.entries(genCounts).map(([gen, count]) => ({
      generation: parseInt(gen),
      yours: (count / total) * 100,
      average: AVERAGE_GEN_DISTRIBUTION[parseInt(gen)] || 0,
      deviation: (count / total) * 100 - (AVERAGE_GEN_DISTRIBUTION[parseInt(gen)] || 0),
    }));

    // BST stats
    const bsts = pokemon.map((p) => p.bst).sort((a, b) => a - b);
    const bstStats = {
      min: bsts[0],
      max: bsts[bsts.length - 1],
      avg: Math.round(bsts.reduce((a, b) => a + b, 0) / total),
      median: bsts[Math.floor(total / 2)],
      averageRegion: AVERAGE_BST,
    };

    // Evolution stats
    const evoLevels = pokemon
      .map((p) => p.evolutionLevel)
      .filter((l): l is number => l !== null);
    const avgEvoLevel = evoLevels.length
      ? Math.round(evoLevels.reduce((a, b) => a + b, 0) / evoLevels.length)
      : 0;
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
      evolutionStats: {
        avgLevel: avgEvoLevel,
        averageRegionLevel: AVERAGE_EVOLUTION_LEVEL,
        stageDistribution: stageCounts,
      },
      legendaryCount: pokemon.filter((p) => p.isLegendary).length,
      mythicalCount: pokemon.filter((p) => p.isMythical).length,
      monoTypeCount: pokemon.filter((p) => p.types.length === 1).length,
      dualTypeCount: pokemon.filter((p) => p.types.length === 2).length,
    };
  }, [slots]);
}
