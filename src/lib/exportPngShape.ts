export const EXPORT_CORNER_RATIO = 0.04;

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
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, exportCornerRadius(width, height));
  ctx.clip();
}
