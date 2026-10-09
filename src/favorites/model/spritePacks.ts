import { allPickerMons } from './catalog';
import { GEN_AXIS, GEN_NUMBERS, TYPE_AXIS, type GenAxisId, type TypeAxisId } from './cells';
import { eligibleFor } from './eligibility';

/**
 * Which picker sprites travel together in one file. The build
 * (scripts/picker-sprite-packs.ts) and the browser (spritePreload.ts) both run
 * this module, so they agree on every pack's contents and order without an
 * index of 1,391 paths in the page's JavaScript.
 *
 * A pack is the sprites' PNG files, unchanged, behind a header: the sprite
 * count, then each sprite's byte length, as unsigned 32-bit little-endian
 * integers. Sprites follow in the order these functions return.
 */

/** Normal / Gen I, the cell nearly every visitor opens first. Its cell pack is bulk pack 0. */
export const FIRST_CELL = { type: 'normal', gen: 1 } as const satisfies { type: TypeAxisId; gen: GenAxisId };

/** What the build tells the browser: the bulk packs, in load order, and where the cell packs are. */
export interface PackManifest {
  /** Each bulk pack holds the next `count` sprites of `bulkGroups()[group]`. */
  packs: { url: string; group: number; count: number }[];
  /** A cell's pack is `${cells}${type}-${gen}.bin`, except the first cell's, which is `packs[0]`. */
  cells: string;
}

/** A cell's sprites, once each, in pack order. */
export function cellSprites(type: TypeAxisId, gen: GenAxisId): string[] {
  return [...new Set(eligibleFor(type, gen).map((mon) => mon.sprite))].sort();
}

/**
 * Every picker sprite in groups, in the order a visitor needs them: the first
 * cell, then one group per generation. Extra rows and columns hold forms of
 * those generations, so they need no group of their own. The build splits a
 * large group into several packs.
 */
export function bulkGroups(): string[][] {
  const first = cellSprites(FIRST_CELL.type, FIRST_CELL.gen);
  const taken = new Set(first);
  const byGen = GEN_NUMBERS.map(() => new Set<string>());
  for (const mon of allPickerMons()) {
    if (!taken.has(mon.sprite)) byGen[mon.generation - 1].add(mon.sprite);
  }
  return [first, ...byGen.map((sprites) => [...sprites].sort())];
}

/** Every cell a selector can open with its own sprites to show. */
export function packedCells(): { type: TypeAxisId; gen: GenAxisId }[] {
  return TYPE_AXIS.flatMap((type) => GEN_AXIS.map((gen) => ({ type, gen })))
    .filter(({ type, gen }) => eligibleFor(type, gen).length > 0);
}

export function cellPackName(type: TypeAxisId, gen: GenAxisId): string {
  return `${type}-${gen}.bin`;
}
