export const EXPORT_CORNER_RATIO = 0.04;

export const EXPORT_SPRITE_PX = 96;

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
  const transform = ctx.getTransform();
  const scaleX = Math.abs(transform.a) || 1;
  const scaleY = Math.abs(transform.d) || 1;
  const pixelWidth = Math.round(width * scaleX) / scaleX;
  const pixelHeight = Math.round(height * scaleY) / scaleY;
  ctx.beginPath();
  ctx.roundRect(0, 0, pixelWidth, pixelHeight, exportCornerRadius(pixelWidth, pixelHeight));
  ctx.clip();
}
