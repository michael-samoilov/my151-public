export interface PlotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Pin a point to the closed plot rectangle. */
export function clampToRect(x: number, y: number, rect: PlotRect): { x: number; y: number } {
  const x1 = rect.x + rect.width;
  const y1 = rect.y + rect.height;
  return {
    x: Math.min(Math.max(x, rect.x), x1),
    y: Math.min(Math.max(y, rect.y), y1),
  };
}

/** CSS `left` for a vertical line that must stay inside the plot. */
export function lineLeftInPlot(x: number, rect: PlotRect, thickness = 1): number {
  const max = rect.x + Math.max(rect.width - thickness, 0);
  return Math.min(Math.max(x, rect.x), max);
}

/** Category index from an axis-tooltip payload, skipping silent custom series. */
export function tipDataIndex(params: unknown): number {
  const arr = Array.isArray(params) ? params : params == null ? [] : [params];
  let fallback: number | undefined;
  for (const p of arr) {
    if (p == null || typeof p !== 'object' || !('dataIndex' in p)) continue;
    const i = p.dataIndex;
    if (typeof i !== 'number' || !Number.isFinite(i)) continue;
    if ('seriesType' in p && p.seriesType === 'line') return i;
    fallback ??= i;
  }
  return fallback ?? 0;
}

/**
 * Category index for a category axis with `boundaryGap: false`.
 * x = left edge is index 0; x = right edge is `lastIndex`.
 */
export function categoryIndexAtX(x: number, rect: PlotRect, lastIndex: number): number {
  if (lastIndex <= 0) return 0;
  const t = (x - rect.x) / Math.max(rect.width, 1);
  const i = Math.round(t * lastIndex);
  return Math.min(Math.max(i, 0), lastIndex);
}
