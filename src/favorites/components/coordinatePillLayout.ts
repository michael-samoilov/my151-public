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

/** One fixed band, including a touch target, above every coordinate selector tile. */
export function coordinateBandLayout(spritePx: number, inset: number, markPx: number) {
  const layout = coordinatePillLayout(spritePx, inset, markPx);
  const height = spritePx >= 96 ? 26 : 24;
  return { ...layout, width: spritePx - inset, height, overflowWidth: height };
}

export function visibleOriginCount(origins: SourceCoordinate[], pointer: boolean, current: OriginContext | undefined,
  layout: ReturnType<typeof coordinateBandLayout>): number {
  const widths = origins.map(origin => layout.size * (singleOriginMark(origin, pointer, current) ? 1 : 2));
  if (widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * layout.gap <= layout.width) return origins.length;
  let used = 0;
  let count = 0;
  for (const width of widths.slice(0, 2)) {
    if (used + width + (count + 1) * layout.gap + layout.overflowWidth > layout.width) break;
    used += width;
    count++;
  }
  return count;
}
