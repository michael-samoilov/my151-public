import type { Pokemon } from '@/types/pokemon';
import { getAllPokemon } from '@/hooks/usePokemonData';

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
 * Split evolutions and other oddballs get case-by-case treatment during the
 * build (DECISIONS.md item 6); this module only answers "roughly when would
 * a form of this strength evolve".
 */

interface Fit {
  slope: number;
  intercept: number;
}

let fitCache: Fit | null = null;

/** Ordinary least squares of evolution level on BST, over level-evolvers. */
export function fitLevelOnBst(all: Pokemon[]): Fit {
  const points = all.filter(
    (p) => p.evolvesFrom !== null && p.evolutionLevel !== null,
  );
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 30 };
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of points) {
    const x = p.bst;
    const y = p.evolutionLevel as number;
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

function fit(): Fit {
  if (!fitCache) fitCache = fitLevelOnBst(getAllPokemon());
  return fitCache;
}

/** Clamp keeps a prediction inside the range real evolution levels occupy. */
function clampLevel(level: number): number {
  return Math.max(1, Math.min(70, Math.round(level)));
}

/**
 * The level at which this form "arrives": its real evolution level, an
 * implied one from the regression when it has none, or 0 for a base form
 * (base forms are always eligible).
 */
export function arrivalLevel(p: Pokemon): number {
  if (p.evolvesFrom === null) return 0;
  if (p.evolutionLevel !== null) return p.evolutionLevel;
  const { slope, intercept } = fit();
  return clampLevel(slope * p.bst + intercept);
}

/** Test seam: drop the memoized fit. */
export function resetImpliedLevelFit(): void {
  fitCache = null;
}
