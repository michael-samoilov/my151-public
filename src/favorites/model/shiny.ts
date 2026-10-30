import { shinySpriteUrl } from '@/lib/spriteUrl';
import { getPickerMon } from './catalog';
import { parseCellKey, type GenAxisId, type TypeAxisId } from './cells';
import { kindFor } from './eligibility';
import { pointerPool, pointerSourceKeys } from './pointers';

export function pickerShinySprite(id: number): string | null {
  const mon = getPickerMon(id);
  return mon ? shinySpriteUrl(mon.sprite) : null;
}

/** One option of a pointer cell: a Pokémon in one look, and the source cells that show it in that look. */
export interface PointerOption {
  id: number;
  shiny: boolean;
  sources: string[];
}

/** The looks a pointer's source cells show `id` in, normal first, then shiny. */
function pointerVariants(
  type: TypeAxisId,
  gen: GenAxisId,
  fills: Readonly<Record<string, number>>,
  shiny: Readonly<Record<string, number>>,
  id: number,
): PointerOption[] {
  const holding = pointerSourceKeys(type, gen).filter((source) => fills[source] === id);
  return [false, true].flatMap((look) => {
    const sources = holding.filter((source) => isShinyCell(fills, shiny, source) === look);
    return sources.length > 0 ? [{ id, shiny: look, sources }] : [];
  });
}

/** A pointer cell's options. A Pokémon that its sources show both normal and shiny is two options. */
export function pointerOptions(
  type: TypeAxisId,
  gen: GenAxisId,
  fills: Readonly<Record<string, number>>,
  shiny: Readonly<Record<string, number>>,
): PointerOption[] {
  return pointerPool(type, gen, fills).flatMap((id) => pointerVariants(type, gen, fills, shiny, id));
}

/**
 * Whether a cell shows its Pokémon shiny. A pick cell is shiny when `shiny`
 * holds the cell's current id, so an entry that a later pick, clear, or
 * repack left behind reads as normal. A pointer cell shows its Pokémon in the
 * look its sources show it in. When they show it both ways, `shiny` holds the
 * user's choice, and the cell stays normal until the user chooses shiny.
 */
export function isShinyCell(
  fills: Readonly<Record<string, number>>,
  shiny: Readonly<Record<string, number>>,
  key: string,
): boolean {
  const id = fills[key];
  const cell = parseCellKey(key);
  if (id == null || !cell) return false;
  if (kindFor(cell.type, cell.gen) === 'pointer') {
    const variants = pointerVariants(cell.type, cell.gen, fills, shiny, id);
    return variants.length > 1 ? shiny[key] === id : variants[0]?.shiny === true;
  }
  return shiny[key] === id && pickerShinySprite(id) !== null;
}
