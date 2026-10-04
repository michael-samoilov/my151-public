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

/** One contained overlay row, including a touch target, inside the sprite tile. */
export function coordinateOverlayLayout(spritePx: number, inset: number, markPx: number) {
  const layout = coordinatePillLayout(spritePx, inset, markPx);
  // Shared disc has radius 15 in a 32px viewBox; compensate its transparent rim.
  const circleSize = 2 * layout.size / Math.sqrt(Math.PI) * 32 / 30;
  const pairSize = layout.size * 0.95;
  const badgeWidth = layout.size * 1.15;
  const height = Math.max(circleSize, 24 - inset * 2);
  return { ...layout, circleSize, pairSize, width: spritePx - inset, height, badgeWidth, badgeHeight: layout.size, overflowWidth: 24 };
}

export function visibleOriginCount(origins: SourceCoordinate[], pointer: boolean, current: OriginContext | undefined,
  layout: ReturnType<typeof coordinateOverlayLayout>): number {
  const widths = origins.map(origin => {
    const single = singleOriginMark(origin, pointer, current);
    return single?.source === 'gen' ? layout.circleSize : single ? layout.size : layout.pairSize * 2;
  });
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
