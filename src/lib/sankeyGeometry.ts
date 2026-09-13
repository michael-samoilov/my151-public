/** Insets and type that fit the chart's own width. Compact kicks in when
 *  desktop pads would leave an 8-column funnel too little plot. */
export function sankeyGeometry(width: number, kind: 'funnel' | 'referrer') {
  const compact = width < 600;
  if (kind === 'referrer') {
    return compact
      ? { compact, left: 92, right: 48, top: 12, bottom: 28, nodeWidth: 8, nodeGap: 8, fontSize: 9 }
      : { compact, left: 128, right: 72, top: 20, bottom: 36, nodeWidth: 12, nodeGap: 18, fontSize: 11 };
  }
  return compact
    ? { compact, left: 8, right: 80, top: 36, bottom: 48, nodeWidth: 8, nodeGap: 12, fontSize: 9 }
    : { compact, left: 100, right: 88, top: 24, bottom: 48, nodeWidth: 12, nodeGap: 20, fontSize: 11 };
}
