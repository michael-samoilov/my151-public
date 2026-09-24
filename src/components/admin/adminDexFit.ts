import {
  OUTLINE_GAP,
  OUTLINE_PAD,
  OUTLINE_STROKE_FRAC,
  outlineStrokeW,
} from '@/lib/sectionOutlines';

/** Columns + gaps + outline pad + stroke + 1.2× sprite bleed, in tile units. */
export function dexColFactor(cols: number): number {
  return cols + (cols - 1) * OUTLINE_GAP + 2 * OUTLINE_PAD + OUTLINE_STROKE_FRAC + 0.2;
}

export function dexTileSize(width: number, cols: number): number {
  return Math.max(8, width / dexColFactor(cols));
}

/** Visual width including pad, outline stroke, and 1.2× sprite bleed. */
export function dexPaintWidth(tileSize: number, cols: number): number {
  const gap = tileSize * OUTLINE_GAP;
  const pad = tileSize * OUTLINE_PAD;
  const stroke = outlineStrokeW(tileSize, OUTLINE_STROKE_FRAC);
  return cols * tileSize + (cols - 1) * gap + 2 * pad + stroke + tileSize * 0.2;
}
