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

export interface ChainSlot {
  mon: PickerMon;
  from: TypeName | null;
  to: TypeName | null;
}

export type TypeFills = Partial<Record<TypeName, PickerMon>>;

function otherTypes(mon: PickerMon, fromType: TypeName): TypeName[] {
  return mon.types.filter((t) => t !== fromType && (TYPES18 as readonly string[]).includes(t));
}

function occupantType(map: TypeFills, id: number): TypeName | null {
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

function placeIncoming(
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

function hasLeave(path: PackMove[]): boolean {
  return path.some((step) => step.kind === 'leave' || step.to == null);
}

export function enumeratePaths(
  map: TypeFills,
  dest: TypeName,
  incoming: PickerMon,
): { paths: PackMove[][]; total: number; vacantFrom: TypeName | null } {
  const placed = placeIncoming(map, dest, incoming);
  const paths: PackMove[][] = [];

  if (placed.occupant) {
    paths.push([
      ...placed.moves,
      { mon: placed.occupant, from: placed.hole, to: null, kind: 'leave' },
    ]);
  }

  function walk(
    cur: TypeFills,
    displaced: PickerMon | null,
    hole: TypeName,
    moves: PackMove[],
    seen: Set<number>,
  ): void {
    if (!displaced) {
      paths.push(moves);
      return;
    }
    const seats = otherTypes(displaced, hole).filter((seat) => seat !== dest);
    for (const seat of seats) {
      const there = cur[seat] && cur[seat]!.id !== displaced.id ? cur[seat]! : null;
      if (there && seen.has(there.id)) continue;
      const next = cloneMap(cur);
      next[seat] = displaced;
      const step: PackMove = {
        mon: displaced,
        from: hole,
        to: seat,
        kind: there ? 'bump' : 'slide',
      };
      const nextSeen = new Set(seen);
      nextSeen.add(displaced.id);
      walk(next, there, seat, [...moves, step], nextSeen);
    }
  }

  walk(placed.map, placed.occupant, placed.hole, placed.moves, new Set([incoming.id]));

  paths.sort((a, b) => a.length - b.length || Number(hasLeave(a)) - Number(hasLeave(b)));
  return { paths, total: paths.length, vacantFrom: placed.vacantFrom };
}

export function selectorChain(path: PackMove[]): ChainSlot[] {
  return path.map(({ mon, from, to }) => ({ mon, from, to }));
}

export function packingNeeded(map: TypeFills, dest: TypeName, incoming: PickerMon): boolean {
  const occupant = map[dest];
  if (!occupant || occupant.id === incoming.id) return false;
  return enumeratePaths(map, dest, incoming).paths.some((path) =>
    path.every((step) => step.kind !== 'leave'),
  );
}

export function applyPathToTypeMap(map: TypeFills, path: PackMove[]): TypeFills {
  const next = cloneMap(map);
  for (const step of path) {
    if (step.from && next[step.from]?.id === step.mon.id) delete next[step.from];
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

const PACK_PAGE = 2;
const PACK_FULL_MAX = 4;

export function chainSlotKey(slot: ChainSlot): string {
  return `${slot.mon.id}:${slot.from ?? ''}:${slot.to ?? ''}`;
}

export function packListMode(chains: { slots: ChainSlot[] }[]): 'full' | 'stepped' {
  return chains.some((chain) => chain.slots.length > PACK_FULL_MAX) ? 'stepped' : 'full';
}

export function packStepOptions(
  chains: { path: PackMove[]; slots: ChainSlot[] }[],
  prefix: string,
): { key: string; slots: ChainSlot[]; path: PackMove[] | null; prefix: string }[] {
  const committed = prefix === '' ? 0 : prefix.split('|').length;
  const active = chains.filter((chain) => {
    const head = chain.slots.map(chainSlotKey).join('|');
    return prefix === '' || head === prefix || head.startsWith(`${prefix}|`);
  });
  const groups = new Map<string, { slots: ChainSlot[]; path: PackMove[] | null; longer: boolean }>();
  for (const chain of active) {
    const next = chain.slots.slice(committed, committed + PACK_PAGE);
    if (next.length === 0) continue;
    const key = next.map(chainSlotKey).join('|');
    let group = groups.get(key);
    if (!group) {
      group = { slots: next, path: null, longer: false };
      groups.set(key, group);
    }
    if (chain.slots.length > committed + next.length) group.longer = true;
    else group.path = chain.path;
  }
  return [...groups.entries()].map(([key, group]) => ({
    key,
    slots: group.slots,
    path: group.longer ? null : group.path,
    prefix: prefix === '' ? key : `${prefix}|${key}`,
  }));
}

export function uniqueChains(paths: PackMove[][]): { path: PackMove[]; slots: ChainSlot[] }[] {
  const seen = new Set<string>();
  const out: { path: PackMove[]; slots: ChainSlot[] }[] = [];
  for (const path of paths) {
    const slots = selectorChain(path);
    const key = slots.map(chainSlotKey).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path, slots });
  }
  return out;
}
