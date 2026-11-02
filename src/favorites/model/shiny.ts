import { shinySpriteUrl } from '@/lib/spriteUrl';
import { getPickerMon } from './catalog';
import { parseCellKey, type GenAxisId, type TypeAxisId } from './cells';
import { kindFor } from './eligibility';
import { pointerPool, pointerSourceKeys } from './pointers';

export function pickerShinySprite(id: number): string | null {
  const mon = getPickerMon(id);
  return mon ? shinySpriteUrl(mon.sprite) : null;
}

export interface PointerOption {
  id: number;
  shiny: boolean;
  sources: string[];
}

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

export function pointerOptions(
  type: TypeAxisId,
  gen: GenAxisId,
  fills: Readonly<Record<string, number>>,
  shiny: Readonly<Record<string, number>>,
): PointerOption[] {
  return pointerPool(type, gen, fills).flatMap((id) => pointerVariants(type, gen, fills, shiny, id));
}

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
