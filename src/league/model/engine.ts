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

/** A shiny Pokémon stays shiny through evolution, Mega Evolution, and Gigantamax, so the flag is the line's. */
export interface PlacedLine {
  branch: number[];
  boundaries: number[];
  boundaryMode?: 'auto' | 'manual';
  shiny?: true;
}

export interface CardCell {
  seat: number;
  pokemonId: number | null;
  isLegend: boolean;
  shiny: boolean;
}

/** On a whole card, the star marks a shiny line once, on its first cell, and every shiny legend. */
export function showsShinyStar(cell: CardCell, row: number): boolean {
  return cell.shiny && (cell.isLegend || row === joinRow(cell.seat));
}

export function levelBoundaries(branch: number[]): number[] {
  return branch.map((id, stage) => {
    if (stage === 0) return 1;
    const p = getPokemonById(id);
    const level = p ? arrivalLevel(p) : 0;
    for (let row = 1; row <= ROW_COUNT; row++) {
      if (LEVEL_CURVE[row - 1] >= level) return row;
    }
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

export function makePlacedLine(branch: number[], shiny = false): PlacedLine {
  return { branch, boundaries: defaultBoundaries(branch), boundaryMode: 'auto', ...(shiny ? { shiny: true } : null) };
}

export function effectiveBoundaries(line: PlacedLine): number[] {
  return line.boundaryMode === 'auto' ? defaultBoundaries(line.branch) : line.boundaries;
}

export function stageAt(line: PlacedLine, row: number): number {
  const boundaries = effectiveBoundaries(line);
  let stage = 0;
  for (let i = 1; i < line.branch.length; i++) {
    if (boundaries[i] <= row) stage = i;
  }
  return stage;
}

export function signatureMember(
  line: PlacedLine | undefined,
  picked: number | null,
): number | null {
  if (!line) return null;
  if (picked !== null && line.branch.includes(picked)) return picked;
  return line.branch[stageAt(line, BOSS_ROW)] ?? null;
}

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
  seat: number;
  shiny?: true;
}

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
    let shiny = false;
    const legend = legends.find((l) => l.seat === seat);
    if (row === BOSS_ROW && legend) {
      pokemonId = legend.pokemonId;
      isLegend = true;
      shiny = legend.shiny === true;
    } else if (line && row >= joinRow(seat)) {
      pokemonId = line.branch[stageAt(line, row)];
      shiny = line.shiny === true;
    }
    cells.push({ seat, pokemonId, isLegend, shiny });
  }
  return cells;
}

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

export function placedIds(lines: PlacedLine[]): number[] {
  return lines.flatMap((l) => l.branch);
}

export function visibleMembers(line: PlacedLine, seat: number): number[] {
  const ids: number[] = [];
  for (let row = joinRow(seat); row <= ROW_COUNT; row++) {
    const id = line.branch[stageAt(line, row)];
    if (id !== undefined && ids[ids.length - 1] !== id) ids.push(id);
  }
  return ids;
}

export function moveSeat<T>(items: T[], fromSeat: number, toSeat: number): T[] {
  const next = [...items];
  const [moved] = next.splice(fromSeat - 1, 1);
  if (moved === undefined) return items;
  next.splice(toSeat - 1, 0, moved);
  return next;
}

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
