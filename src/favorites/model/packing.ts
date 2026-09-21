import type { TypeName } from '@/types/pokemon';
import { TYPES18, cellKey } from './cells';
import type { GenNumber } from './cells';
import type { PickerMon } from './catalog';

export type PackKind = 'place' | 'slide' | 'bump' | 'leave' | 'fill';

export interface PackMove {
  mon: PickerMon;
  from: TypeName | null;
  to: TypeName | null;
  kind: PackKind;
}

export type SlotRole = 'vacate' | 'place' | 'to' | 'cycle' | 'trash';

export interface ChainSlot {
  type: TypeName | null;
  mon: PickerMon | null;
  role: SlotRole;
}

export type TypeFills = Partial<Record<TypeName, PickerMon>>;

const MAX_SHOW_PATHS = 8;
const MAX_COUNT = 80;
const MAX_DEPTH = 18;

function otherTypes(mon: PickerMon, fromType: TypeName): TypeName[] {
  return mon.types.filter((t) => t !== fromType && (TYPES18 as readonly string[]).includes(t));
}

export function occupantType(map: TypeFills, id: number): TypeName | null {
  for (const t of TYPES18) {
    if (map[t]?.id === id) return t;
  }
  return null;
}

function cloneMap(map: TypeFills): TypeFills {
  return { ...map };
}

export function typeMapFromFills(
  fills: Record<string, number>,
  gen: GenNumber,
  resolve: (id: number) => PickerMon | undefined,
): TypeFills {
  const map: TypeFills = {};
  for (const t of TYPES18) {
    const id = fills[cellKey(t, gen)];
    if (id == null) continue;
    const mon = resolve(id);
    if (mon) map[t] = mon;
  }
  return map;
}

export function placeIncoming(
  map: TypeFills,
  dest: TypeName,
  incoming: PickerMon,
): {
  map: TypeFills;
  moves: PackMove[];
  vacantFrom: TypeName | null;
  occupant: PickerMon | null;
  hole: TypeName;
} {
  const next = cloneMap(map);
  const from = occupantType(next, incoming.id);
  const occupant = next[dest] && next[dest]!.id !== incoming.id ? next[dest]! : null;
  const moves: PackMove[] = [];
  if (from && from !== dest) {
    delete next[from];
    moves.push({ mon: incoming, from, to: dest, kind: 'slide' });
  } else {
    moves.push({ mon: incoming, from: null, to: dest, kind: 'place' });
  }
  next[dest] = incoming;
  return { map: next, moves, vacantFrom: from && from !== dest ? from : null, occupant, hole: dest };
}

function enumerateBumpResolutions(
  map: TypeFills,
  displaced: PickerMon | null,
  hole: TypeName,
  moves: PackMove[],
  dest: TypeName,
  depth: number,
  caps: { maxBump: number; truncated: boolean },
): { map: TypeFills; moves: PackMove[] }[] {
  const out: { map: TypeFills; moves: PackMove[] }[] = [];
  if (caps.truncated) return out;
  if (!displaced) {
    out.push({ map, moves });
    return out;
  }
  if (depth >= caps.maxBump) {
    out.push({
      map,
      moves: [...moves, { mon: displaced, from: hole, to: null, kind: 'leave' }],
    });
    return out;
  }
  const seats = otherTypes(displaced, hole).filter((s) => s !== dest);
  out.push({
    map: cloneMap(map),
    moves: [...moves, { mon: displaced, from: hole, to: null, kind: 'leave' }],
  });
  for (const seat of seats) {
    if (caps.truncated) break;
    const next = cloneMap(map);
    const there = next[seat] && next[seat]!.id !== displaced.id ? next[seat]! : null;
    next[seat] = displaced;
    const step: PackMove = {
      mon: displaced,
      from: hole,
      to: seat,
      kind: there ? 'bump' : 'slide',
    };
    out.push(...enumerateBumpResolutions(next, there, seat, [...moves, step], dest, depth + 1, caps));
  }
  return out;
}

export function fillersFor(map: TypeFills, vacantType: TypeName, lockedType: TypeName) {
  const out: PackMove[] = [];
  for (const t of TYPES18) {
    if (t === vacantType || t === lockedType) continue;
    const mon = map[t];
    if (!mon) continue;
    if (mon.types.includes(vacantType) && mon.types.includes(t)) {
      out.push({ mon, from: t, to: vacantType, kind: 'fill' });
    }
  }
  return out;
}

function fillDfs(
  cur: TypeFills,
  vacant: TypeName | null,
  dest: TypeName,
  soFar: PackMove[],
  movedIds: Set<number>,
  depth: number,
  caps: { maxDepth: number; truncated: boolean },
  record: (list: PackMove[]) => void,
): void {
  if (caps.truncated) return;
  if (!vacant || depth >= caps.maxDepth) {
    record(soFar);
    return;
  }
  const optsFill = fillersFor(cur, vacant, dest).filter((f) => !movedIds.has(f.mon.id));
  record(soFar);
  if (caps.truncated) return;
  for (const f of optsFill) {
    if (caps.truncated) return;
    const next = cloneMap(cur);
    if (f.from) delete next[f.from];
    if (f.to) next[f.to] = f.mon;
    const nextMoved = new Set(movedIds);
    nextMoved.add(f.mon.id);
    fillDfs(next, f.from, dest, [...soFar, f], nextMoved, depth + 1, caps, record);
  }
}

export function enumeratePaths(
  map: TypeFills,
  dest: TypeName,
  incoming: PickerMon,
  opts: { maxShow?: number; maxCount?: number; maxDepth?: number } = {},
): { paths: PackMove[][]; total: number; vacantFrom: TypeName | null } {
  const maxShow = opts.maxShow ?? MAX_SHOW_PATHS;
  const maxCount = opts.maxCount ?? MAX_COUNT;
  const maxDepth = opts.maxDepth ?? MAX_DEPTH;
  const placed = placeIncoming(map, dest, incoming);
  const caps = { maxDepth, maxBump: maxDepth, truncated: false };
  const paths: PackMove[][] = [];
  let total = 0;

  function record(list: PackMove[]) {
    total += 1;
    if (paths.length < maxShow) paths.push(list);
    if (total >= maxCount) caps.truncated = true;
  }

  const resolutions = enumerateBumpResolutions(
    placed.map,
    placed.occupant,
    placed.hole,
    placed.moves,
    dest,
    0,
    caps,
  );

  for (const res of resolutions) {
    if (caps.truncated) break;
    const movedIds = new Set(res.moves.map((s) => s.mon.id));
    fillDfs(res.map, placed.vacantFrom, dest, res.moves, movedIds, 0, caps, record);
  }

  paths.sort((a, b) => a.length - b.length);
  return { paths, total, vacantFrom: placed.vacantFrom };
}

/**
 * Selector chain. The origin slot shows the incoming Pokémon faded when that
 * form already sat on this generation — not a blank ball.
 */
export function selectorChain(path: PackMove[]): ChainSlot[] {
  const slots: ChainSlot[] = [];
  if (!path.length) return slots;
  const incoming = path[0].mon;
  const origin = path[0].from;
  if (origin) slots.push({ type: origin, mon: incoming, role: 'vacate' });
  for (const step of path) {
    if (step.mon.id === incoming.id) {
      if (step.to) slots.push({ type: step.to, mon: step.mon, role: 'place' });
      continue;
    }
    if (!step.to) {
      slots.push({ type: null, mon: step.mon, role: 'trash' });
      continue;
    }
    const cycle = Boolean(origin && step.to === origin);
    slots.push({ type: step.to, mon: step.mon, role: cycle ? 'cycle' : 'to' });
  }
  return slots;
}

export function packingNeeded(map: TypeFills, dest: TypeName, incoming: PickerMon): boolean {
  const from = occupantType(map, incoming.id);
  const occupant = map[dest] && map[dest]!.id !== incoming.id ? map[dest] : null;
  return Boolean((from && from !== dest) || occupant);
}

export function applyPathToTypeMap(map: TypeFills, path: PackMove[]): TypeFills {
  const next = cloneMap(map);
  for (const step of path) {
    if (step.from) delete next[step.from];
    if (step.to) next[step.to] = step.mon;
  }
  return next;
}

export function applyTypeMapToFills(
  fills: Record<string, number>,
  gen: GenNumber,
  map: TypeFills,
): Record<string, number> {
  const next = { ...fills };
  for (const t of TYPES18) {
    const key = cellKey(t, gen);
    const mon = map[t];
    if (mon) next[key] = mon.id;
    else delete next[key];
  }
  return next;
}

export function uniqueChains(paths: PackMove[][]): { path: PackMove[]; slots: ChainSlot[] }[] {
  const seen = new Set<string>();
  const out: { path: PackMove[]; slots: ChainSlot[] }[] = [];
  for (const path of paths) {
    const slots = selectorChain(path);
    const key = slots
      .map((s) => `${s.role}:${s.type ?? ''}:${s.mon?.id ?? ''}`)
      .join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path, slots });
  }
  return out;
}
