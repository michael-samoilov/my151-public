/** Insets and type that fit the chart's own width. Compact kicks in when
 *  desktop pads (108+96) would leave an 8-column funnel too little plot. */
export function sankeyGeometry(width: number, kind: 'funnel' | 'referrer') {
  const compact = width < 600;
  if (kind === 'referrer') {
    return compact
      ? { compact, left: 76, right: 44, top: 16, bottom: 16, nodeWidth: 8, nodeGap: 8, fontSize: 9 }
      : { compact, left: 108, right: 72, top: 28, bottom: 28, nodeWidth: 12, nodeGap: 18, fontSize: 11 };
  }
  return compact
    ? { compact, left: 8, right: 8, top: 32, bottom: 32, nodeWidth: 8, nodeGap: 14, fontSize: 9 }
    : { compact, left: 108, right: 96, top: 28, bottom: 28, nodeWidth: 12, nodeGap: 22, fontSize: 11 };
}
