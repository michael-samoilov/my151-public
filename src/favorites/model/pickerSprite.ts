import { tileImageCssPx } from '@/lib/tileImage';
import { SELECTOR_MAX_COLS } from './prettyWrap';

const PICKER_INSET_MAX = 8;

export function pickerSpriteCssPx(viewportCssPx: number): number {
  return tileImageCssPx(viewportCssPx);
}

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
