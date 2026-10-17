import { OUTLINE_GAP, OUTLINE_PAD, OUTLINE_STROKE_FRAC } from '@/lib/sectionOutlines';

function dexColFactor(cols: number): number {
  return cols + (cols - 1) * OUTLINE_GAP + 2 * OUTLINE_PAD + OUTLINE_STROKE_FRAC + 0.2;
}

export function dexTileSize(width: number, cols: number): number {
  return Math.max(8, width / dexColFactor(cols));
}

