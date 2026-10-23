import { TYPE_NAMES, type TypeName } from '@/types/pokemon';
import { typeEffectiveness } from '@/data/type-effectiveness';
import type { Pokemon } from '@/types/pokemon';
import { getAllPokemon, withoutSpecials } from '@/hooks/usePokemonData';

interface TypeDominanceResult {
  type: TypeName;
  score: number;
}

const IMMUNITY_FLOOR = 0.125;

export function computeTypeDominance(pokemon: Pokemon[]): TypeDominanceResult[] {
  if (pokemon.length === 0) return [];
  const n = pokemon.length;

  return TYPE_NAMES.map((attackingType) => {
    let sum = 0;

    for (const opponent of pokemon) {
      const rawOffense = typeEffectiveness(attackingType, opponent.types as TypeName[]);
      const offense = Math.max(rawOffense, IMMUNITY_FLOOR);

      let bestDefense = 0;
      for (const oppType of opponent.types) {
        const eff = typeEffectiveness(oppType as TypeName, [attackingType]);
        if (eff > bestDefense) bestDefense = eff;
      }
      const defense = Math.max(bestDefense, IMMUNITY_FLOOR);

      sum += Math.log2(offense / defense);
    }

    return { type: attackingType, score: sum / n };
  });
}

export function computePerPokemonMatchup(attackingType: TypeName, pokemon: Pokemon[]): { pokemon: Pokemon; matchup: number; offense: number; defense: number; bestDefenseType: TypeName }[] {
  return pokemon.map(opponent => {
    const rawOffense = typeEffectiveness(attackingType, opponent.types as TypeName[]);
    const offense = Math.max(rawOffense, IMMUNITY_FLOOR);

    let bestDefense = 0;
    let bestDefenseType: TypeName = opponent.types[0] as TypeName;
    for (const oppType of opponent.types) {
      const eff = typeEffectiveness(oppType as TypeName, [attackingType]);
      if (eff > bestDefense) {
        bestDefense = eff;
        bestDefenseType = oppType as TypeName;
      }
    }
    const defense = Math.max(bestDefense, IMMUNITY_FLOOR);

    return { pokemon: opponent, matchup: Math.log2(offense / defense), offense: rawOffense, defense, bestDefenseType };
  });
}

let _nationalBaseline: Map<TypeName, number> | null = null;

export function getNationalBaseline(): Map<TypeName, number> {
  if (_nationalBaseline) return _nationalBaseline;
  const allPokemon = getAllPokemon();
  const results = computeTypeDominance(allPokemon);
  _nationalBaseline = new Map(results.map(r => [r.type, r.score]));
  return _nationalBaseline;
}

let _nationalBaselineFiltered: Map<TypeName, number> | null = null;

export function getNationalBaselineFiltered(starterIds: Set<number>): Map<TypeName, number> {
  if (_nationalBaselineFiltered) return _nationalBaselineFiltered;
  const allPokemon = withoutSpecials(getAllPokemon(), starterIds);
  const results = computeTypeDominance(allPokemon);
  _nationalBaselineFiltered = new Map(results.map(r => [r.type, r.score]));
  return _nationalBaselineFiltered;
}
