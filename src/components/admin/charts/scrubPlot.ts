export interface PlotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clampToRect(x: number, y: number, rect: PlotRect): { x: number; y: number } {
  const x1 = rect.x + rect.width;
  const y1 = rect.y + rect.height;
  return {
    x: Math.min(Math.max(x, rect.x), x1),
    y: Math.min(Math.max(y, rect.y), y1),
  };
}

export function lineLeftInPlot(x: number, rect: PlotRect, thickness = 1): number {
  const max = rect.x + Math.max(rect.width - thickness, 0);
  return Math.min(Math.max(x, rect.x), max);
}

export function categoryIndexAtX(x: number, rect: PlotRect, lastIndex: number): number {
  if (lastIndex <= 0) return 0;
  const t = (x - rect.x) / Math.max(rect.width, 1);
  const i = Math.round(t * lastIndex);
  return Math.min(Math.max(i, 0), lastIndex);
}

// platform: ECharts draws a lone category in the middle of the plot.
export function categoryX(index: number, rect: PlotRect, lastIndex: number): number {
  if (lastIndex <= 0) return rect.x + rect.width / 2;
  return rect.x + (index / lastIndex) * rect.width;
}
