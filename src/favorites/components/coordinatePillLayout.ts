import { isGenNumber, isTypeName, type GenAxisId, type TypeAxisId } from '../model/cells';
import type { PointerMark, SourceCoordinate } from '../model/pointers';
import { sharedPickOtherCoordinate } from '../model/taken';
import { displayCoordinate } from './coordinatePresentation';

export type OriginContext = { type: TypeAxisId; gen: GenAxisId };
export type DrillDownOriginContext = { gen: GenAxisId; type?: TypeAxisId };

/** Keep source coordinates intact while omitting axes supplied by the drilldown. */
export function drillDownOriginMarks(origins: SourceCoordinate[], context: DrillDownOriginContext) {
  const favoriteAxes = new Set(origins.flatMap<TypeAxisId | GenAxisId>(origin => {
    const display = displayCoordinate(origin.type, origin.gen);
    return display.type === 'favorite' && display.gen != null ? [display.gen]
      : display.gen === 'favorite' ? [display.type] : [];
  }));
  const impliedByFavorite = (axis: TypeAxisId | GenAxisId) =>
    axis !== 'legendary' && axis !== 'gimmick' && favoriteAxes.has(axis);
  return origins.flatMap(origin => {
    const display = displayCoordinate(origin.type, origin.gen);
    // A favorite pair records which row or column was summarized.
    if (display.type === 'favorite' || display.gen === 'favorite') return [{ origin, single: undefined }];
    const omitGen = origin.gen === context.gen || impliedByFavorite(origin.gen);
    const omitType = origin.type === context.type || impliedByFavorite(origin.type);
    if (omitGen && omitType) return [];
    const axis = omitGen ? origin.type : omitType ? origin.gen : undefined;
    const single: PointerMark | undefined = axis == null || axis === 'favorite' ? undefined
      : isGenNumber(axis) ? { source: 'gen', value: axis }
        : isTypeName(axis) ? { source: 'type', value: axis } : { source: axis };
    return [{ origin, single }];
  });
}

/** The selector supplies the shared coordinate; summaries supply their category. */
export function singleOriginMark(origin: SourceCoordinate, pointer: boolean, current?: OriginContext): PointerMark | undefined {
  if (pointer) return origin.mark;
  const other = current && sharedPickOtherCoordinate(origin, current);
  return other == null || other === 'favorite' ? undefined
    : isGenNumber(other) ? { source: 'gen', value: other }
      : isTypeName(other) ? { source: 'type', value: other } : { source: other };
}

/** Fixed proportional bounds; origin count never changes glyph size. */
function coordinatePillLayout(spritePx: number, inset: number, markPx: number) {
  const gap = Math.max(1, Math.round(spritePx * 0.02));
  const available = Math.max(1, spritePx - inset * 2);
  const columns = available >= 40 + gap ? 2 : 1;
  const size = Math.min((available - (columns - 1) * gap) / (columns * 2), Math.max(10, markPx * 0.75));
  return { size, gap, columns, width: available };
}

/** Equal filled circle area despite the shared disc asset's transparent rim. */
export function equalAreaDiscSize(squareSide: number) {
  return 2 * squareSide / Math.sqrt(Math.PI) * 32 / 30;
}

/** Filled backgrounds share squareSide²; outline strokes and glyphs are excluded. */
export function originShapeGeometry(squareSide: number) {
  const radius = squareSide * 0.2;
  const roundedSide = squareSide / Math.sqrt(1 - (4 - Math.PI) * 0.04);
  const halfWidth = squareSide + (2 - Math.PI / 2) * radius ** 2 / squareSide;
  return { radius, halfWidth, roundedSide, roundedRadius: roundedSide * 0.2, circleDiameter: 2 * squareSide / Math.sqrt(Math.PI), outlineOutset: equalAreaDiscSize(squareSide) / 128 };
}

/** One contained overlay row inside the sprite tile. */
export function coordinateOverlayLayout(spritePx: number, inset: number, markPx: number) {
  const initial = coordinatePillLayout(spritePx, inset, markPx);
  const width = spritePx - inset;
  const unit = originShapeGeometry(1);
  const paintedCircle = unit.circleDiameter + unit.outlineOutset * 2;
  // Four painted circles, three gaps, and transparent SVG rims at both ends.
  const size = Math.min(initial.size, (width - initial.gap * 3) / (equalAreaDiscSize(1) + paintedCircle * 3));
  const shape = originShapeGeometry(size);
  const circleSize = equalAreaDiscSize(size);
  const height = circleSize;
  return { ...initial, ...shape, size, circleSize, width, height };
}

/** Padding measures the space between a CSS box and its painted outline edge. */
export function originMarkBox(single: PointerMark | undefined, layout: ReturnType<typeof coordinateOverlayLayout>) {
  return single?.source === 'gen'
    ? { width: layout.circleSize, height: layout.circleSize, padding: (layout.circleSize - layout.circleDiameter) / 2 - layout.outlineOutset, units: 1 }
    : single
      ? { width: layout.roundedSide, height: layout.roundedSide, padding: -layout.outlineOutset, units: 1 }
      : { width: layout.halfWidth * 2, height: layout.size, padding: -layout.outlineOutset, units: 2 };
}

export function visibleOriginCount(origins: SourceCoordinate[], pointer: boolean, current: OriginContext | undefined,
  layout: ReturnType<typeof coordinateOverlayLayout>, marks?: (PointerMark | undefined)[]): number {
  const units = origins.map((origin, index) => originMarkBox(marks ? marks[index] : singleOriginMark(origin, pointer, current), layout).units);
  if (units.reduce((sum, count) => sum + count, 0) <= 4) return origins.length;
  let used = 0;
  let count = 0;
  for (const next of units) {
    if (used + next + 1 > 4) break;
    used += next;
    count++;
  }
  return count;
}
