import { getAllPokemon, getPokemonById } from '@/hooks/usePokemonData';
import { pokemonLabel } from '@/i18n';
import type { Pokemon } from '@/types/pokemon';
import { LEVEL_CURVE, ROW_COUNT, TEAM_SIZES, joinRow } from '@/league/model/constants';
import { defaultBoundaries } from '@/league/model/engine';
import {
  arrivalLevelWith,
  fitLevelOnBst,
  fitQuality,
  isLevelEvolver,
  isLevellessEvolver,
  predictLevel,
  rowForLevel,
  type LevelFit,
} from '@/league/model/levelFit';

/**
 * Everything the diagnostic page draws, computed once.
 *
 * The same numbers `npm run level-report` prints. Both read the model rather
 * than restating it, so the page cannot drift from what the card does.
 */

export interface LevelPoint {
  id: number;
  /** The published name, form descriptor included — never the dataset slug. */
  name: string;
  bst: number;
  level: number;
  /** The row the card's curve puts this arrival in. */
  row: number;
}

export interface Chain {
  members: Pokemon[];
  boundaries: number[];
}

export interface LevelModel {
  fit: LevelFit;
  quality: { n: number; r2: number; rmse: number };
  real: LevelPoint[];
  implied: LevelPoint[];
  bstRange: [number, number];
  /** Stages whose implied arrival lands at or before their pre-evolution's. */
  inversions: { pre: LevelPoint; post: LevelPoint }[];
  /** Lines whose default rows skip a member; the shelf handle reveals it. */
  skipsAMember: { names: string[]; rows: number[]; skipped: string[] }[];
  /** The fit's own worst misses, on the data it was fitted to. */
  residuals: { point: LevelPoint; predicted: number; error: number }[];
  /** Lines that begin on a baby form, which the picker always includes. */
  babyLines: { baby: string; next: string; level: number }[];
  /** One pre-evolution, several evolutions: the card seats one branch. */
  branches: { from: string; to: { name: string; level: number }[] }[];
  /** Rows each seat offers, against the stages a line may need. */
  seatCapacity: { seat: number; joinRow: number; rows: number }[];
}

/** The published name, so the page never prints a slug like `mr-mime`. */
function label(p: Pokemon): string {
  return pokemonLabel(p.id, p.name).full;
}

function point(p: Pokemon, fit: LevelFit): LevelPoint {
  const level = arrivalLevelWith(p, fit);
  return { id: p.id, name: label(p), bst: p.bst, level, row: rowForLevel(level) };
}

/** Every chain, root to leaf, one branch per leaf. */
function chains(all: Pokemon[]): Pokemon[][] {
  const kids = new Map<number, Pokemon[]>();
  for (const p of all) {
    if (p.evolvesFrom === null) continue;
    const list = kids.get(p.evolvesFrom);
    if (list) list.push(p);
    else kids.set(p.evolvesFrom, [p]);
  }
  const out: Pokemon[][] = [];
  const walk = (path: Pokemon[]) => {
    const next = kids.get(path[path.length - 1].id);
    if (!next || next.length === 0) {
      if (path.length > 1) out.push(path);
      return;
    }
    for (const child of next) walk([...path, child]);
  };
  for (const root of all) if (root.evolvesFrom === null) walk([root]);
  return out;
}

let cached: LevelModel | null = null;

export function levelModel(): LevelModel {
  if (cached) return cached;
  const all = getAllPokemon();
  const fit = fitLevelOnBst(all);
  const real = all.filter(isLevelEvolver).map((p) => point(p, fit));
  const implied = all.filter(isLevellessEvolver).map((p) => point(p, fit));
  const bsts = real.map((p) => p.bst);

  const inversions: LevelModel['inversions'] = [];
  for (const p of all) {
    if (p.evolvesFrom === null) continue;
    const pre = getPokemonById(p.evolvesFrom);
    if (!pre || pre.evolvesFrom === null) continue;
    if (arrivalLevelWith(p, fit) <= arrivalLevelWith(pre, fit)) {
      inversions.push({ pre: point(pre, fit), post: point(p, fit) });
    }
  }

  const skipsAMember: LevelModel['skipsAMember'] = [];
  for (const chain of chains(all)) {
    const rows = defaultBoundaries(chain.map((p) => p.id));
    const shown = new Set<number>();
    for (let row = 1; row <= ROW_COUNT; row++) {
      let stage = 0;
      for (let i = 1; i < rows.length; i++) if (rows[i] <= row) stage = i;
      shown.add(stage);
    }
    if (shown.size < chain.length) {
      skipsAMember.push({
        names: chain.map(label),
        rows,
        skipped: chain.filter((_, i) => !shown.has(i)).map(label),
      });
    }
  }

  const residuals = real
    .map((p) => {
      const predicted = predictLevel(p.bst, fit);
      return { point: p, predicted, error: p.level - predicted };
    })
    .sort((a, b) => Math.abs(b.error) - Math.abs(a.error))
    .slice(0, 10);

  const babyLines = all
    .filter((p) => p.evolvesFrom !== null && (getPokemonById(p.evolvesFrom)?.isBaby ?? false))
    .map((p) => ({
      baby: label(getPokemonById(p.evolvesFrom as number)!),
      next: label(p),
      level: arrivalLevelWith(p, fit),
    }));

  const kids = new Map<number, Pokemon[]>();
  for (const p of all) {
    if (p.evolvesFrom === null) continue;
    const list = kids.get(p.evolvesFrom);
    if (list) list.push(p);
    else kids.set(p.evolvesFrom, [p]);
  }
  const branches = [...kids.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([id, v]) => ({
      from: (() => { const pre = getPokemonById(id); return pre ? label(pre) : String(id); })(),
      to: v.map((c) => ({ name: label(c), level: arrivalLevelWith(c, fit) })),
    }));

  const seatCapacity = Array.from({ length: TEAM_SIZES[ROW_COUNT - 1] }, (_, i) => {
    const seat = i + 1;
    return { seat, joinRow: joinRow(seat), rows: ROW_COUNT - joinRow(seat) + 1 };
  });

  cached = {
    fit,
    quality: fitQuality(all, fit),
    real,
    implied,
    bstRange: [Math.min(...bsts), Math.max(...bsts)],
    inversions,
    skipsAMember,
    residuals,
    babyLines,
    branches,
    seatCapacity,
  };
  return cached;
}

/** The card's own thresholds, for the row bands drawn behind the scatter. */
export const ROW_THRESHOLDS = LEVEL_CURVE;
