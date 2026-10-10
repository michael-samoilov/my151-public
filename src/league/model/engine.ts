import { getPokemonById } from '@/league/data/catalog';
import {
  BOSS_ROW,
  CHAMPION_ROW,
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
  boundaryMode?: 'auto' | 'manual';
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

/**
 * The curve's preferred first row for each stage, before presentation rules.
 * Kept separate so persisted automatic lines from the old curve-only policy
 * can be identified during migration without mistaking a manual drag for one.
 */
export function levelBoundaries(branch: number[]): number[] {
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

export function defaultBoundaries(branch: number[]): number[] {
  const boundaries = levelBoundaries(branch);
  const lastStage = boundaries.length - 1;

  for (let stage = 1; stage <= lastStage; stage++) {
    const previous = boundaries[stage - 1];
    if (boundaries[stage] <= 1 && previous === 1) continue;

    const earliest = previous + 1;
    const latest = CHAMPION_ROW - (lastStage - stage);
    boundaries[stage] = Math.min(latest, Math.max(earliest, boundaries[stage]));
  }

  return boundaries;
}

export function makePlacedLine(branch: number[]): PlacedLine {
  return { branch, boundaries: defaultBoundaries(branch), boundaryMode: 'auto' };
}

/** Explicit auto intent follows today's defaults; manual and legacy rows stay put. */
export function effectiveBoundaries(line: PlacedLine): number[] {
  return line.boundaryMode === 'auto' ? defaultBoundaries(line.branch) : line.boundaries;
}

/** The stage index a line shows at a row, respecting manual boundaries. */
export function stageAt(line: PlacedLine, row: number): number {
  const boundaries = effectiveBoundaries(line);
  let stage = 0;
  for (let i = 1; i < line.branch.length; i++) {
    if (boundaries[i] <= row) stage = i;
  }
  return stage;
}

/**
 * The member a signature mark shows.
 *
 * The picker offers one tile per Pokemon, so the pick names a Pokemon. Brock's
 * ace is Onix and his line runs Onix into Steelix, so deriving the member from
 * the boss row would show Steelix and contradict the tap.
 *
 * `picked` is null on a card marked before the pick was recorded, and stale
 * once the seat's line is replaced. Both fall back to the member the boss row
 * fields, which is the best answer available without a pick.
 */
export function signatureMember(
  line: PlacedLine | undefined,
  picked: number | null,
): number | null {
  if (!line) return null;
  if (picked !== null && line.branch.includes(picked)) return picked;
  return line.branch[stageAt(line, BOSS_ROW)] ?? null;
}

/**
 * Set one stage's first row, pushing neighbours instead of clamping into
 * them: earlier boundaries cap at the new row, later ones floor at it, so
 * the non-decreasing invariant holds while a shelf may fully cover its
 * neighbours. A covered stage keeps its slot (boundaries equal) and either
 * adjacent run's edge handle can reveal it again — the old clamp-only form
 * made a squeezed-out middle stage unrecoverable. Stage 0 is pinned to row 1.
 */
export function setBoundary(line: PlacedLine, stage: number, row: number): number[] {
  const next = [...effectiveBoundaries(line)];
  if (stage <= 0 || stage >= next.length) return next;
  const r = Math.max(1, Math.min(ROW_COUNT + 1, row));
  next[stage] = r;
  for (let j = stage - 1; j >= 1; j--) next[j] = Math.min(next[j], r);
  for (let j = stage + 1; j < next.length; j++) next[j] = Math.max(next[j], r);
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
  legends: readonly LegendPick[],
): CardCell[] {
  const size = TEAM_SIZES[row - 1];
  const cells: CardCell[] = [];
  for (let seat = size; seat >= 1; seat--) {
    const line = lines[seat - 1];
    let pokemonId: number | null = null;
    let isLegend = false;
    // A seat holds at most one legendary, but the row may hold several: an
    // endgame team of six legendaries is a card a person can build.
    const legend = legends.find((l) => l.seat === seat);
    if (row === BOSS_ROW && legend) {
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
  legends: readonly LegendPick[],
): CardCell[][] {
  const rows: CardCell[][] = [];
  for (let row = 1; row <= ROW_COUNT; row++) {
    rows.push(deriveRow(lines, row, legends));
  }
  return rows;
}

/** Every id a card currently shows or stores — the browser's "assigned" set. */
export function placedIds(lines: PlacedLine[]): number[] {
  return lines.flatMap((l) => l.branch);
}

/**
 * Members of one seated line that the card template actually draws in that
 * seat. Seat 6 (leftmost) only exists on the champion and boss rows, so a
 * three-stage line can show at most two Pokémon there — never the whole
 * branch dumped into the column.
 */
export function visibleMembers(line: PlacedLine, seat: number): number[] {
  const ids: number[] = [];
  for (let row = joinRow(seat); row <= ROW_COUNT; row++) {
    const id = line.branch[stageAt(line, row)];
    if (id !== undefined && ids[ids.length - 1] !== id) ids.push(id);
  }
  return ids;
}

/** Reorder a seat, Excel-style: remove and reinsert, the rest close up. */
export function moveSeat<T>(items: T[], fromSeat: number, toSeat: number): T[] {
  const next = [...items];
  const [moved] = next.splice(fromSeat - 1, 1);
  if (moved === undefined) return items;
  next.splice(toSeat - 1, 0, moved);
  return next;
}

/** Whether a league summary row has no trainer placed yet. */
export function leagueSlotIsEmpty(card: {
  lines: { length: number };
  type: unknown;
  theme: string;
  badgeName: string;
  partnerId?: number | null;
  tmMoveId?: number | null;
}): boolean {
  return card.lines.length === 0
    && (!card.type || card.type === 'none')
    && !card.theme
    && !card.badgeName
    && card.partnerId == null
    && card.tmMoveId == null;
}

/**
 * Move a league slot on the home summary.
 *
 * Empty drop: only the dragged trainer moves into that hole. Empties are not
 * boxes, so neighbours do not shift. Occupied drop: shift the occupied
 * segment into the nearest passed hole. Earlier holes stop displacement.
 */
export function moveLeagueSlots<T>(
  slots: readonly T[],
  from: number,
  to: number,
  isEmpty: (slot: T) => boolean,
  blank: () => T,
): T[] {
  if (!Number.isInteger(from) || !Number.isInteger(to)
      || from === to || from < 0 || to < 0 || from >= slots.length || to >= slots.length) {
    return [...slots];
  }
  const next = slots.slice();
  if (isEmpty(next[from])) return next;
  if (isEmpty(next[to])) {
    const moved = next[from];
    next[from] = blank();
    next[to] = moved;
    return next;
  }
  const moved = slots[from];
  const step = from < to ? 1 : -1;
  let hole = from;
  for (let i = from + step; i !== to; i += step) {
    if (isEmpty(slots[i])) hole = i;
  }
  next[from] = blank();
  for (let i = hole; i !== to; i += step) {
    next[i] = slots[i + step];
  }
  next[to] = moved;
  return next;
}
