import type { Pokemon } from '@/types/pokemon';

export interface PackableGroup {
  key: string | number;
  members: Pokemon[];
  matchedIds: Set<number>;
  anchorGen?: number;
}

interface PackedRow<G> {
  groups: G[];
  trailingSpacers: number;
}

export function homeGen(members: readonly Pokemon[], matchedIds: ReadonlySet<number>): number {
  const matched = members.filter((m) => matchedIds.has(m.id));
  const reference = matched.length > 0 ? matched : members;
  return Math.min(...reference.map((m) => m.generation));
}

function pieces<G extends PackableGroup>(group: G, cols: number): G[] {
  const size = group.members.length;
  if (size <= cols) return [group];
  const anchorGen = group.anchorGen ?? homeGen(group.members, group.matchedIds);
  const out: G[] = [];
  for (let at = 0, i = 0; at < size; at += cols, i += 1) {
    out.push({
      ...group,
      key: i === 0 ? group.key : `${group.key}#${i}`,
      members: group.members.slice(at, at + cols),
      anchorGen,
    });
  }
  return out;
}

export function packRows<G extends PackableGroup>(groups: readonly G[], cols: number): PackedRow<G>[] {
  const width = Math.max(1, Math.floor(cols));
  const out: PackedRow<G>[] = [];
  let current: G[] = [];
  let col = 0;
  const close = (trailingSpacers: number) => {
    out.push({ groups: current, trailingSpacers });
    current = [];
    col = 0;
  };
  for (const group of groups) {
    for (const piece of pieces(group, width)) {
      const size = piece.members.length;
      if (col > 0 && col + size > width) close(width - col);
      current.push(piece);
      col += size;
      if (col === width) close(0);
    }
  }
  if (current.length > 0) close(width - col);
  return out;
}
