import type { Pokemon } from '@/types/pokemon';

/** What the packer reads from a line, and what a cut piece of one carries. */
export interface PackableGroup {
  key: string | number;
  members: Pokemon[];
  matchedIds: Set<number>;
  anchorGen?: number;
}

interface PackedRow<G> {
  groups: G[];
  /** Empty cells after the last line, so the next line starts a fresh row. */
  trailingSpacers: number;
}

/**
 * The generation a line calls home: the earliest among the members the
 * filters matched, or among all of them when none did. A retro baby
 * (Chingling, Gen 4, before Chimecho, Gen 3) lands in the original's
 * generation, so the original is not flagged as cross-generation.
 */
export function homeGen(members: readonly Pokemon[], matchedIds: ReadonlySet<number>): number {
  const matched = members.filter((m) => matchedIds.has(m.id));
  const reference = matched.length > 0 ? matched : members;
  return Math.min(...reference.map((m) => m.generation));
}

/**
 * A line no wider than the grid is itself; a wider one is cut into pieces no
 * wider than a row. Each piece keeps the whole line's home generation, so
 * its badges and muting are those the line has uncut.
 */
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

/**
 * Pack lines into rows of `cols` cells.
 *
 * A line never straddles a row: when one will not fit in the columns left,
 * the row is padded out first. That invariant is what lets the grid be
 * windowed by row, and it is what the spacers rely on: a spacer only ever
 * ends a row.
 *
 * A line wider than the grid cannot keep the invariant, so it is cut first.
 * Standalone tiles are where such a line comes from -- Eevee's eight
 * branches merge into nine tiles -- and there each tile is its own
 * rectangle and its own pick, so the cut changes nothing a person can see.
 * Left uncut, nine tiles in a six-wide grid ran three cells into the next
 * visual row, and every row after started three cells early: its trailing
 * spacers landed mid-row as one-cell gaps, and the window counted one row
 * too few.
 */
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
