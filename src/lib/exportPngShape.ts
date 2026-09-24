export const EXPORT_CORNER_RADIUS = 12;

export function clipExportCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, EXPORT_CORNER_RADIUS);
  ctx.clip();
}
