import {
  GEN_AXIS,
  TYPE_AXIS,
  cellKey,
  cellKind,
  isGenNumber,
  isTypeName,
  parseCellKey,
  type GenAxisId,
  type TypeAxisId,
} from './cells';
import type { PointerMark, SourceCoordinate } from './pointers';

type Coordinate = TypeAxisId | GenAxisId;
type Cell = readonly [TypeAxisId, GenAxisId];

/**
 * A row or a column of the grid. The legendary row and the legendary column
 * are one line, and so are the gimmick row and the gimmick column. Every cell
 * on a line has the `shared` coordinate.
 */
type Line = { shared: Coordinate; cells: readonly Cell[] };

function isLinked(id: Coordinate): id is 'legendary' | 'gimmick' {
  return id === 'legendary' || id === 'gimmick';
}

/** The source coordinate left after the selector supplies a shared pick line. */
export function sharedPickOtherCoordinate(source: { type: TypeAxisId; gen: GenAxisId }, current: { type: TypeAxisId; gen: GenAxisId }): Coordinate | undefined {
  if (source.type === current.type) return source.gen;
  if (source.gen === current.gen) return source.type;
  if (isLinked(source.type) && source.type === current.gen) return source.gen;
  if (isLinked(source.gen) && source.gen === current.type) return source.type;
  return undefined;
}

function columnCells(type: TypeAxisId): Cell[] {
  return GEN_AXIS.map((gen) => [type, gen] as const);
}

function rowCells(gen: GenAxisId): Cell[] {
  return TYPE_AXIS.map((type) => [type, gen] as const);
}

function rowLine(gen: GenAxisId): Line {
  return { shared: gen, cells: isLinked(gen) ? [...columnCells(gen), ...rowCells(gen)] : rowCells(gen) };
}

function columnLine(type: TypeAxisId): Line {
  return { shared: type, cells: isLinked(type) ? [...columnCells(type), ...rowCells(type)] : columnCells(type) };
}

function axisMark(id: Coordinate): PointerMark | null {
  if (isTypeName(id)) return { source: 'type', value: id };
  if (isGenNumber(id)) return { source: 'gen', value: id };
  return id === 'favorite' ? null : { source: id };
}

type Peer = { key: string; mark: PointerMark };

/**
 * The pick cells that share a row or a column with a pick cell, each with the
 * mark for its other coordinate. A pointer cell has no peers.
 */
function peersOf(type: TypeAxisId, gen: GenAxisId): Peer[] {
  if (cellKind(type, gen, false) !== 'pick') return [];
  const here = cellKey(type, gen);
  const peers: Peer[] = [];
  for (const line of [rowLine(gen), columnLine(type)]) {
    for (const [t, g] of line.cells) {
      const key = cellKey(t, g);
      if (key === here || cellKind(t, g, false) !== 'pick') continue;
      const other = sharedPickOtherCoordinate({ type: t, gen: g }, { type, gen });
      const mark = other == null ? null : axisMark(other);
      if (mark) peers.push({ key, mark });
    }
  }
  return peers;
}

function markKey(mark: PointerMark): string {
  return `${mark.source}:${'value' in mark ? mark.value : ''}`;
}

/** Each Pokémon a peer of this cell holds, with one mark per peer that holds it. */
export function takenIn(
  fills: Record<string, number>,
  type: TypeAxisId,
  gen: GenAxisId,
): Map<number, PointerMark[]> {
  const taken = new Map<number, PointerMark[]>();
  for (const { key, mark } of peersOf(type, gen)) {
    const id = fills[key];
    if (id == null) continue;
    const marks = taken.get(id) ?? [];
    if (!marks.some((m) => markKey(m) === markKey(mark))) marks.push(mark);
    taken.set(id, marks);
  }
  return taken;
}

/** `fills` without `id` in any peer of this cell. */
export function withoutRepeats(
  fills: Record<string, number>,
  type: TypeAxisId,
  gen: GenAxisId,
  id: number,
): Record<string, number> {
  const next = { ...fills };
  for (const { key } of peersOf(type, gen)) {
    if (next[key] === id) delete next[key];
  }
  return next;
}

/** Direct peer cells; unlike axis marks, distinct coordinate pairs stay distinct. */
export function takenCoordinatesIn(fills: Record<string, number>, type: TypeAxisId, gen: GenAxisId) {
  const result = new Map<number, SourceCoordinate[]>();
  for (const { key, mark } of peersOf(type, gen)) {
    const id = fills[key];
    const cell = parseCellKey(key);
    if (id == null || !cell) continue;
    const origins = result.get(id) ?? [];
    if (!origins.some((origin) => cellKey(origin.type, origin.gen) === key)) origins.push({ ...cell, mark });
    result.set(id, origins);
  }
  return result;
}

/** Display-only origins from other pick cells; summary pointers add no new pick. */
export function pickedCoordinatesElsewhere(fills: Record<string, number>, type: TypeAxisId, gen: GenAxisId) {
  const result = new Map<number, SourceCoordinate[]>();
  const here = cellKey(type, gen);
  const peerMarks = new Map(peersOf(type, gen).map(({ key, mark }) => [key, mark]));
  for (const g of GEN_AXIS) {
    for (const t of TYPE_AXIS) {
      const key = cellKey(t, g);
      if (key === here || cellKind(t, g, false) !== 'pick') continue;
      const id = fills[key];
      const mark = peerMarks.get(key) ?? axisMark(g) ?? axisMark(t);
      if (id == null || !mark) continue;
      const origins = result.get(id) ?? [];
      origins.push({ type: t, gen: g, mark });
      result.set(id, origins);
    }
  }
  return result;
}
