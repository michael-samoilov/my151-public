import type { Pokemon } from '@/types/pokemon';
import { getAllPokemon } from '@/hooks/usePokemonData';
import { arrivalLevelWith, fitLevelOnBst, type LevelFit } from './levelFit';

let fitCache: LevelFit | null = null;

function fit(): LevelFit {
  if (!fitCache) fitCache = fitLevelOnBst(getAllPokemon());
  return fitCache;
}

export function arrivalLevel(p: Pokemon): number {
  return arrivalLevelWith(p, fit());
}

