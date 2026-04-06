import { TYPE_NAMES, type TypeName } from '@/types/pokemon';
import { typeEffectiveness } from '@/data/type-effectiveness';
import type { Pokemon } from '@/types/pokemon';
import { getAllPokemon } from '@/hooks/usePokemonData';

export interface TypeDominanceResult {
  type: TypeName;
  /** Per-Pokemon average log2(offense/defense). Scale: +1 ≈ SE edge, -1 ≈ resisted, 0 = neutral */
  score: number;
}

// Immunities (0x) clamped to 0.125 so they score ±3 (one step beyond double resistance at ±2)
const IMMUNITY_FLOOR = 0.125;

/**
 * Compute type dominance scores for each of the 18 types against a set of Pokemon.
 *
 * For each type T and each opponent Pokemon P:
 *   offense = effectiveness of T vs P's types (product, clamped min 0.125)
 *   defense = best of P's types vs T (clamped min 0.125)
 *   matchup = log2(offense / defense)
 *
 * Returns the per-Pokemon average matchup score for each type.
 * Positive = on average, this type has a super-effective-level edge per encounter.
 */
export function computeTypeDominance(pokemon: Pokemon[]): TypeDominanceResult[] {
  if (pokemon.length === 0) return [];
  const n = pokemon.length;

  return TYPE_NAMES.map((attackingType) => {
    let sum = 0;

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

      sum += Math.log2(offense / defense);
    }

    return { type: attackingType, score: sum / n };
  });
}

/**
 * Compute the individual matchup score of a single attacking type vs each Pokemon.
 * Returns per-Pokemon log2(offense/defense) values plus raw multipliers for drill-down display.
 */
export function computePerPokemonMatchup(attackingType: TypeName, pokemon: Pokemon[]): { pokemon: Pokemon; matchup: number; offense: number; defense: number }[] {
  return pokemon.map(opponent => {
    const rawOffense = typeEffectiveness(attackingType, opponent.types as TypeName[]);
    const offense = Math.max(rawOffense, IMMUNITY_FLOOR);

    let bestDefense = 0;
    for (const oppType of opponent.types) {
      const eff = typeEffectiveness(oppType as TypeName, [attackingType]);
      if (eff > bestDefense) bestDefense = eff;
    }
    const defense = Math.max(bestDefense, IMMUNITY_FLOOR);

    return { pokemon: opponent, matchup: Math.log2(offense / defense), offense: rawOffense, defense: Math.max(bestDefense, IMMUNITY_FLOOR) };
  });
}

/** National baseline — computed once lazily and cached */
let _nationalBaseline: Map<TypeName, number> | null = null;

export function getNationalBaseline(): Map<TypeName, number> {
  if (_nationalBaseline) return _nationalBaseline;
  const allPokemon = getAllPokemon();
  const results = computeTypeDominance(allPokemon);
  _nationalBaseline = new Map(results.map(r => [r.type, r.score]));
  return _nationalBaseline;
}

/** National baseline excluding legendaries/mythicals/starters */
let _nationalBaselineFiltered: Map<TypeName, number> | null = null;

export function getNationalBaselineFiltered(starterIds: Set<number>): Map<TypeName, number> {
  if (_nationalBaselineFiltered) return _nationalBaselineFiltered;
  const allPokemon = getAllPokemon().filter(p => !p.isLegendary && !p.isMythical && !starterIds.has(p.id));
  const results = computeTypeDominance(allPokemon);
  _nationalBaselineFiltered = new Map(results.map(r => [r.type, r.score]));
  return _nationalBaselineFiltered;
}
