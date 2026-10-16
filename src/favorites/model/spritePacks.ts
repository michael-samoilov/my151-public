import { allPickerMons } from './catalog';
import { GEN_AXIS, GEN_NUMBERS, TYPE_AXIS, type GenAxisId, type TypeAxisId } from './cells';
import { eligibleFor } from './eligibility';

export const FIRST_CELL = { type: 'normal', gen: 1 } as const satisfies { type: TypeAxisId; gen: GenAxisId };

export interface PackManifest {
  packs: { url: string; group: number; count: number }[];
  cells: string;
}

export function cellSprites(type: TypeAxisId, gen: GenAxisId): string[] {
  return [...new Set(eligibleFor(type, gen).map((mon) => mon.sprite))].sort();
}

export function bulkGroups(): string[][] {
  const first = cellSprites(FIRST_CELL.type, FIRST_CELL.gen);
  const taken = new Set(first);
  const byGen = GEN_NUMBERS.map(() => new Set<string>());
  for (const mon of allPickerMons()) {
    if (!taken.has(mon.sprite)) byGen[mon.generation - 1].add(mon.sprite);
  }
  return [first, ...byGen.map((sprites) => [...sprites].sort())];
}

export function packedCells(): { type: TypeAxisId; gen: GenAxisId }[] {
  return TYPE_AXIS.flatMap((type) => GEN_AXIS.map((gen) => ({ type, gen })))
    .filter(({ type, gen }) => eligibleFor(type, gen).length > 0);
}

export function cellPackName(type: TypeAxisId, gen: GenAxisId): string {
  return `${type}-${gen}.bin`;
}
