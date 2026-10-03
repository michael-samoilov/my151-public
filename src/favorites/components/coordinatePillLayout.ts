import { isGenNumber, isTypeName, type GenAxisId, type TypeAxisId } from '../model/cells';
import type { PointerMark, SourceCoordinate } from '../model/pointers';

export type OriginContext = { type: TypeAxisId; gen: GenAxisId };

/** The selector supplies the shared coordinate; summaries supply their category. */
export function singleOriginMark(origin: SourceCoordinate, pointer: boolean, current?: OriginContext): PointerMark | undefined {
  if (pointer) return origin.mark;
  if (origin.type === current?.type) {
    return isGenNumber(origin.gen) ? { source: 'gen', value: origin.gen }
      : origin.gen !== 'favorite' ? { source: origin.gen } : undefined;
  }
  if (origin.gen === current?.gen) {
    return isTypeName(origin.type) ? { source: 'type', value: origin.type }
      : origin.type !== 'favorite' ? { source: origin.type } : undefined;
  }
  return undefined;
}

/** Fixed proportional sizing; origin count changes rows, never glyph size. */
export function coordinatePillLayout(spritePx: number, inset: number, markPx: number) {
  const gap = Math.max(1, Math.round(spritePx * 0.02));
  const available = Math.max(1, spritePx - inset * 2);
  const columns = available >= 40 + gap ? 2 : 1;
  const size = Math.min((available - (columns - 1) * gap) / (columns * 2), Math.max(10, markPx * 0.75));
  return { size, gap, columns, width: available };
}

/** Use the same widths as the flex layout to reserve complete metadata rows. */
export function originRows(origins: SourceCoordinate[], pointer: boolean, current: OriginContext | undefined,
  layout: ReturnType<typeof coordinatePillLayout>): number {
  let rows = 0;
  let used = 0;
  for (const origin of origins) {
    const width = layout.size * (singleOriginMark(origin, pointer, current) ? 1 : 2);
    if (!rows || used + layout.gap + width > layout.width + 0.01) {
      rows++;
      used = width;
    } else used += layout.gap + width;
  }
  return rows;
}
