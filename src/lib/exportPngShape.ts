export const EXPORT_CORNER_RATIO = 0.04;

/**
 * Every export paints its smallest Pokémon sprites at 1×: one PNG px per
 * native sprite px. A larger PNG only adds file size, and a scale that is not
 * a whole multiple blurs the pixel art.
 */
export const EXPORT_SPRITE_PX = 96;

/** The frame's width in PNG px beside those 1× sprites: an eighth of a sprite. */
export const EXPORT_FRAME_PX = 12;

export function exportCornerRadius(width: number, height: number): number {
  return Math.min(width, height) * EXPORT_CORNER_RATIO;
}

export function exportInnerCornerRadius(width: number, height: number, inset: number): number {
  return Math.max(0, exportCornerRadius(width, height) - inset);
}

export function clipExportCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  // Match the clip to the integer backing store. Layout widths can be
  // fractional, and clipping that fraction gives opposite PNG corners
  // different extents even though the canvas dimensions were rounded.
  const transform = ctx.getTransform();
  const scaleX = Math.abs(transform.a) || 1;
  const scaleY = Math.abs(transform.d) || 1;
  const pixelWidth = Math.round(width * scaleX) / scaleX;
  const pixelHeight = Math.round(height * scaleY) / scaleY;
  ctx.beginPath();
  ctx.roundRect(0, 0, pixelWidth, pixelHeight, exportCornerRadius(pixelWidth, pixelHeight));
  ctx.clip();
}
