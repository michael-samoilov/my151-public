import { useMemo } from 'react';
import { getPokemonById, getAllPokemon } from '@/hooks/usePokemonData';
import { TYPE_NAMES } from '@/types/pokemon';
import { STARTER_IDS } from '@/data/categories';

const allNational = getAllPokemon();

function computeProportions(pokemon: ReturnType<typeof getAllPokemon>) {
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
  return { typeProp, genProp, total };
}

// Precomputed baselines
const fullBaseline = computeProportions(allNational);
const filteredNational = allNational.filter(p => !p.isLegendary && !p.isMythical && !STARTER_IDS.has(p.id));
const filteredBaseline = computeProportions(filteredNational);

export function useRegionalDexAnalytics(
  pokemonIds: number[],
  excludeSpecial: boolean,
  newOnly: boolean,
  generation: number,
) {
  return useMemo(() => {
    const baseline = excludeSpecial ? filteredBaseline : fullBaseline;

    let pokemon = pokemonIds
      .map(id => getPokemonById(id))
      .filter(Boolean)
      .map(p => p!);

    if (newOnly) {
      pokemon = pokemon.filter(p => p.generation === generation);
    }

    if (excludeSpecial) {
      pokemon = pokemon.filter(p => !p.isLegendary && !p.isMythical && !STARTER_IDS.has(p.id));
    }

    const total = pokemon.length;
    if (total === 0) return { typeDeviation: [], generationDeviation: [], total: 0 };

    // Type deviation
    const typeCounts: Record<string, number> = {};
    for (const t of TYPE_NAMES) typeCounts[t] = 0;
    for (const p of pokemon) {
      for (const t of p.types) typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
    const typeDeviation = TYPE_NAMES.map(t => {
      const yourProportion = typeCounts[t] / total;
      const globalProportion = baseline.typeProp[t];
      const ratio = globalProportion > 0 ? yourProportion / globalProportion : 0;
      return {
        type: t,
        count: typeCounts[t],
        deviation: globalProportion > 0 ? (ratio - 1) * 100 : 0,
      };
    }).sort((a, b) => b.deviation - a.deviation);

    // Generation deviation
    const genCounts: Record<number, number> = {};
    for (let g = 1; g <= 9; g++) genCounts[g] = 0;
    for (const p of pokemon) {
      genCounts[p.generation] = (genCounts[p.generation] || 0) + 1;
    }
    const generationDeviation = Object.entries(genCounts).map(([gen, count]) => {
      const g = parseInt(gen);
      const yourProportion = count / total;
      const globalProportion = baseline.genProp[g] || 0;
      const ratio = globalProportion > 0 ? yourProportion / globalProportion : 0;
      return {
        generation: g,
        count,
        deviation: globalProportion > 0 ? (ratio - 1) * 100 : 0,
      };
    });

    return { typeDeviation, generationDeviation, total };
  }, [pokemonIds, excludeSpecial, newOnly, generation]);
}
