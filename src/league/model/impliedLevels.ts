import type { Pokemon } from '@/types/pokemon';
import { getAllPokemon } from '@/hooks/usePokemonData';
import { arrivalLevelWith, fitLevelOnBst, type LevelFit } from './levelFit';

/**
 * Implied evolution levels for level-less evolvers.
 *
 * The auto-evolution engine compares a stage's evolution level against a
 * row's hidden threshold. Stone, trade, friendship and similar evolutions
 * have no level, so they get an implied one: a linear regression of
 * evolution level on the evolved form's BST, fitted over every evolver that
 * DOES have a level. The fit runs once per session over the checked-in
 * dataset (about a thousand rows), so there is nothing to precompute or
 * regenerate when new Pokémon land — the fit is always current.
 *
 * The regression itself lives in `levelFit.ts`, free of the data layer. This
 * module is the app's door to it: read the dataset, fit once, cache.
 *
 * Split evolutions and other oddballs get case-by-case treatment during the
 * build (DECISIONS.md item 6); this module only answers "roughly when would
 * a form of this strength evolve". `npm run level-report` prints where the
 * model strains, and the preview-only page at /evolution-levels draws it.
 */

let fitCache: LevelFit | null = null;

function fit(): LevelFit {
  if (!fitCache) fitCache = fitLevelOnBst(getAllPokemon());
  return fitCache;
}

/**
 * The level at which this form "arrives": its real evolution level, an
 * implied one from the regression when it has none, or 0 for a base form
 * (base forms are always eligible).
 */
export function arrivalLevel(p: Pokemon): number {
  return arrivalLevelWith(p, fit());
}

/** Test seam: drop the memoized fit. */
export function resetImpliedLevelFit(): void {
  fitCache = null;
}
