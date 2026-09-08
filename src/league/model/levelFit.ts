import type { Pokemon } from '@/types/pokemon';
import { LEVEL_CURVE, ROW_COUNT } from './constants';

/**
 * The implied-level model, as pure functions over data handed in.
 *
 * `impliedLevels.ts` is the app's door to this: it reads the dataset and
 * memoizes one fit. The math lives here instead so a script, a test, or the
 * diagnostic page can run it over any set of Pokémon without pulling in the
 * data layer — which drags in the i18n catalogs, and those load through
 * `import.meta.glob`, so they only resolve inside Vite.
 */

export interface LevelFit {
  slope: number;
  intercept: number;
}

/** True for a form that evolves from something at a stated level. */
export function isLevelEvolver(p: Pokemon): boolean {
  return p.evolvesFrom !== null && p.evolutionLevel !== null;
}

/** True for a form that evolves by a stone, a trade, friendship, or similar. */
export function isLevellessEvolver(p: Pokemon): boolean {
  return p.evolvesFrom !== null && p.evolutionLevel === null;
}

/** Ordinary least squares of evolution level on BST, over level-evolvers. */
export function fitLevelOnBst(all: Pokemon[]): LevelFit {
  const points = all.filter(isLevelEvolver);
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

/** How well the fit explains the data it was fitted to. */
export function fitQuality(all: Pokemon[], fit: LevelFit): { n: number; r2: number; rmse: number } {
  const points = all.filter(isLevelEvolver);
  const n = points.length;
  if (n === 0) return { n, r2: 0, rmse: 0 };
  const mean = points.reduce((s, p) => s + (p.evolutionLevel as number), 0) / n;
  let ssRes = 0;
  let ssTot = 0;
  for (const p of points) {
    const err = (p.evolutionLevel as number) - predictLevel(p.bst, fit);
    ssRes += err * err;
    ssTot += ((p.evolutionLevel as number) - mean) ** 2;
  }
  return { n, r2: ssTot > 0 ? 1 - ssRes / ssTot : 0, rmse: Math.sqrt(ssRes / n) };
}

/** The raw prediction, before the clamp. */
export function predictLevel(bst: number, fit: LevelFit): number {
  return fit.slope * bst + fit.intercept;
}

/** Keeps a prediction inside the range real evolution levels occupy. */
export function clampLevel(level: number): number {
  return Math.max(1, Math.min(70, Math.round(level)));
}

/** `arrivalLevel` against a fit supplied by the caller. */
export function arrivalLevelWith(p: Pokemon, fit: LevelFit): number {
  if (p.evolvesFrom === null) return 0;
  if (p.evolutionLevel !== null) return p.evolutionLevel;
  return clampLevel(predictLevel(p.bst, fit));
}

/** First row whose threshold admits a level; ROW_COUNT + 1 means never. */
export function rowForLevel(level: number): number {
  for (let row = 1; row <= ROW_COUNT; row++) {
    if (LEVEL_CURVE[row - 1] >= level) return row;
  }
  return ROW_COUNT + 1;
}
