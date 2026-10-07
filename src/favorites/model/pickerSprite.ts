import { tileImageCssPx } from '@/lib/tileImage';
import { SELECTOR_MAX_COLS } from './prettyWrap';

/** Side inset used when the viewport has room. Matches the dex row's px-2. */
export const PICKER_INSET_MAX = 8;

/**
 * CSS px for every picker sprite.
 *
 * This is the dex image size in a six-sprite row. A larger snap, such as
 * 64px on a 3× phone, puts six sprites past the sheet edge.
 */
export function pickerSpriteCssPx(viewportCssPx: number): number {
  return tileImageCssPx(viewportCssPx);
}

/**
 * Horizontal inset, CSS px, so six sprites stay inside a phone sheet.
 * The desktop pane is sized to the row, so it keeps the full inset.
 */
export function pickerRowInsetPx(viewportCssPx: number, spritePx: number): number {
  const width = viewportCssPx > 0 && Number.isFinite(viewportCssPx) ? viewportCssPx : 1024;
  if (width >= 1024) return PICKER_INSET_MAX;
  const spare = width - spritePx * SELECTOR_MAX_COLS;
  return Math.max(0, Math.min(PICKER_INSET_MAX, Math.floor(spare / 2)));
}

export function fitPickerSpriteCssPx(basePx: number, rows: number, availablePx: number, gapPx: number): number {
  if (rows <= 0) return basePx;
  const fit = Math.floor((availablePx - gapPx * (rows - 1)) / rows);
  return Math.min(basePx, Math.max(1, fit));
}
