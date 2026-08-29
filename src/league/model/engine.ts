import { getPokemonById } from '@/hooks/usePokemonData';
import {
  BOSS_ROW,
  LEVEL_CURVE,
  ROW_COUNT,
  TEAM_SIZES,
  joinRow,
} from './constants';
import { arrivalLevel } from './impliedLevels';

/**
 * The derivation engine. The store holds intent (which branches sit in which
 * seats, where the user dragged an evolution boundary); everything a row
 * displays is computed here, on demand, from that intent plus the fixed
 * tables in constants.ts. Nothing derived is ever stored.
 */

/** One evolution line, seated in a column of the card. */
export interface PlacedLine {
  /** Member ids, base form first. One branch of a chain, never a whole tree. */
  branch: number[];
  /**
   * Per stage: the first row the stage may appear in. Index 0 is always 1.
   * Defaults come from the level curve; a vertical drag rewrites one entry.
   * Invariant: non-decreasing.
   */
  boundaries: number[];
}

/** A single grid cell in a derived row. */
export interface CardCell {
  /** 1 = the rightmost, always-present column. */
  seat: number;
  /** Null = this seat exists in the row but holds nothing yet. */
  pokemonId: number | null;
  /** True for the endgame-boss legendary overlaying this seat. */
  isLegend: boolean;
}

/** First row each stage may appear in, from the hidden level curve. */
export function defaultBoundaries(branch: number[]): number[] {
  return branch.map((id, stage) => {
    if (stage === 0) return 1;
    const p = getPokemonById(id);
    const level = p ? arrivalLevel(p) : 0;
    for (let row = 1; row <= ROW_COUNT; row++) {
      if (LEVEL_CURVE[row - 1] >= level) return row;
    }
    // Above every threshold: the stage never shows on its own. Park it past
    // the last row; a manual drag can still pull it in.
    return ROW_COUNT + 1;
  });
}

export function makePlacedLine(branch: number[]): PlacedLine {
  return { branch, boundaries: defaultBoundaries(branch) };
}

/** The stage index a line shows at a row, respecting manual boundaries. */
export function stageAt(line: PlacedLine, row: number): number {
  let stage = 0;
  for (let i = 1; i < line.branch.length; i++) {
    if (line.boundaries[i] <= row) stage = i;
  }
  return stage;
}

/**
 * Move one stage's boundary to `row`, clamping so the boundaries stay
 * non-decreasing (a stage can never appear before its pre-evolution).
 * Stage 0 is pinned to row 1. Returns new boundaries.
 */
export function shiftBoundary(line: PlacedLine, stage: number, row: number): number[] {
  const next = [...line.boundaries];
  if (stage <= 0 || stage >= next.length) return next;
  const lo = next[stage - 1];
  const hi = stage + 1 < next.length ? next[stage + 1] : ROW_COUNT + 1;
  next[stage] = Math.max(lo, Math.min(hi, row));
  return next;
}

export interface LegendPick {
  pokemonId: number;
  /** The seat the legendary overlays, on the boss row only. */
  seat: number;
}

/**
 * Derive one row of the card. Cells run left to right, highest seat first,
 * and every seat the row's team size allows is present — filled or not —
 * so the grid keeps the template's full shape while half-built.
 */
export function deriveRow(
  lines: PlacedLine[],
  row: number,
  legend: LegendPick | null,
): CardCell[] {
  const size = TEAM_SIZES[row - 1];
  const cells: CardCell[] = [];
  for (let seat = size; seat >= 1; seat--) {
    const line = lines[seat - 1];
    let pokemonId: number | null = null;
    let isLegend = false;
    if (row === BOSS_ROW && legend && legend.seat === seat) {
      pokemonId = legend.pokemonId;
      isLegend = true;
    } else if (line && row >= joinRow(seat)) {
      pokemonId = line.branch[stageAt(line, row)];
    }
    cells.push({ seat, pokemonId, isLegend });
  }
  return cells;
}

/** All 11 rows at once. */
export function deriveRows(
  lines: PlacedLine[],
  legend: LegendPick | null,
): CardCell[][] {
  const rows: CardCell[][] = [];
  for (let row = 1; row <= ROW_COUNT; row++) {
    rows.push(deriveRow(lines, row, legend));
  }
  return rows;
}

/** Every id a card currently shows or stores — the browser's "assigned" set. */
export function placedIds(lines: PlacedLine[]): number[] {
  return lines.flatMap((l) => l.branch);
}

/** Reorder a seat, Excel-style: remove and reinsert, the rest close up. */
export function moveSeat<T>(items: T[], fromSeat: number, toSeat: number): T[] {
  const next = [...items];
  const [moved] = next.splice(fromSeat - 1, 1);
  if (moved === undefined) return items;
  next.splice(toSeat - 1, 0, moved);
  return next;
}
