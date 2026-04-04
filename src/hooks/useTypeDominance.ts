import { TYPE_NAMES, type TypeName } from '@/types/pokemon';
import { typeEffectiveness } from '@/data/type-effectiveness';
import type { Pokemon } from '@/types/pokemon';

export interface TypeDominanceResult {
  type: TypeName;
  score: number;
}

const IMMUNITY_FLOOR = 0.25;

/**
 * Compute type dominance scores for each of the 18 types against a set of Pokemon.
 *
 * For each type T and each opponent Pokemon P:
 *   offense = effectiveness of T vs P's types (product, clamped min 0.25)
 *   defense = best of P's types vs T (clamped min 0.25)
 *   matchup = log2(offense / defense)
 *
 * Score for T = sum of matchup across all Pokemon.
 * Positive = T wins more than it loses across the dex.
 */
export function computeTypeDominance(pokemon: Pokemon[]): TypeDominanceResult[] {
  if (pokemon.length === 0) return [];

  return TYPE_NAMES.map((attackingType) => {
    let score = 0;

    for (const opponent of pokemon) {
      // Offense: attacking type vs opponent's dual types (product), clamped
      const rawOffense = typeEffectiveness(attackingType, opponent.types as TypeName[]);
      const offense = Math.max(rawOffense, IMMUNITY_FLOOR);

      // Defense: opponent's best attacking type vs us, clamped
      let bestDefense = 0;
      for (const oppType of opponent.types) {
        const eff = typeEffectiveness(oppType as TypeName, [attackingType]);
        if (eff > bestDefense) bestDefense = eff;
      }
      const defense = Math.max(bestDefense, IMMUNITY_FLOOR);

      score += Math.log2(offense / defense);
    }

    return { type: attackingType, score };
  });
}
