import { shinySpriteUrl } from '@/lib/spriteUrl';
import { getPickerMon } from './catalog';
import { parseCellKey } from './cells';
import { kindFor } from './eligibility';
import { pointerSourceKeys } from './pointers';

/** The picker Pokémon's shiny sprite, or null when its art has none. */
export function pickerShinySprite(id: number): string | null {
  const mon = getPickerMon(id);
  return mon ? shinySpriteUrl(mon.sprite) : null;
}

/**
 * Whether a cell shows its Pokémon shiny. A pick cell is shiny when `shiny`
 * holds the cell's current id, so an entry that a later pick, clear, or
 * repack left behind reads as normal. A pointer cell stores only an id, so it
 * is shiny when some cell it points at holds that id shiny.
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
    return pointerSourceKeys(cell.type, cell.gen).some((source) => fills[source] === id && isShinyCell(fills, shiny, source));
  }
  return shiny[key] === id && pickerShinySprite(id) !== null;
}
