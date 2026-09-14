/** Insets and type that fit the chart's own width. Compact kicks in when
 *  desktop pads would leave a 5-column funnel too little plot. */
export function sankeyGeometry(width: number, kind: 'funnel' | 'referrer') {
  const compact = width < 600;
  if (kind === 'referrer') {
    return compact
      ? { compact, left: 92, right: 48, top: 12, bottom: 28, nodeWidth: 8, nodeGap: 8, fontSize: 9 }
      : { compact, left: 128, right: 72, top: 20, bottom: 36, nodeWidth: 12, nodeGap: 18, fontSize: 11 };
  }
  return compact
    ? { compact, left: 8, right: 72, top: 24, bottom: 40, nodeWidth: 8, nodeGap: 12, fontSize: 9 }
    : { compact, left: 100, right: 88, top: 24, bottom: 48, nodeWidth: 12, nodeGap: 20, fontSize: 11 };
}

/** Pixel x for each Sankey depth inside the plot. `expandLate` spends more
 *  of the plot on later hops, where peels and names compete. */
export function sankeyColumnXs(
  maxDepth: number,
  plotWidth: number,
  nodeWidth: number,
  expandLate: boolean,
): number[] {
  const span = Math.max(0, plotWidth - nodeWidth);
  if (maxDepth <= 0) return [0];
  if (!expandLate) {
    return Array.from({ length: maxDepth + 1 }, (_, d) => (d / maxDepth) * span);
  }
  const weights = Array.from({ length: maxDepth }, (_, i) => (i + 1) ** 1.35);
  const sum = weights.reduce((a, b) => a + b, 0);
  const xs = [0];
  let acc = 0;
  for (const w of weights) {
    acc += span * (w / sum);
    xs.push(acc);
  }
  return xs;
}
