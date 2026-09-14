/** md breakpoint. Below this, Sankey height scales with width so a phone
 *  chart keeps the same landscape proportions as the desktop funnel. */
export const SANKEY_DESKTOP_WIDTH = 1024;

export function sankeyDesktopHeight(stack: number, kind: 'funnel' | 'referrer'): number {
  if (kind === 'referrer') return Math.max(360, Math.min(520, stack * 36 + 80));
  return Math.max(520, Math.min(740, 200 + stack * 80));
}

export function sankeyMinHeight(kind: 'funnel' | 'referrer'): number {
  return kind === 'referrer' ? 160 : 280;
}

/** Pixel height of the chart box. Caps at the desktop height so a wide
 *  screen does not grow taller than the current desktop funnel. */
export function sankeyChartHeight(width: number, stack: number, kind: 'funnel' | 'referrer'): number {
  const desktopH = sankeyDesktopHeight(stack, kind);
  const minH = sankeyMinHeight(kind);
  const capped = Math.min(Math.max(width, 0), SANKEY_DESKTOP_WIDTH);
  const scaled = (desktopH * capped) / SANKEY_DESKTOP_WIDTH;
  return Math.round(Math.max(minH, Math.min(desktopH, scaled)));
}

export function sankeyHeightCss(stack: number, kind: 'funnel' | 'referrer'): string {
  const desktopH = sankeyDesktopHeight(stack, kind);
  const minH = sankeyMinHeight(kind);
  return `max(${minH}px, min(${desktopH}px, calc(100cqw * ${desktopH} / ${SANKEY_DESKTOP_WIDTH})))`;
}

/** Insets and type that fit the chart's own width. Compact kicks in when
 *  desktop pads would leave a 5-column funnel too little plot. Counts sit
 *  in the bars, so the right pad only needs to fit names. Funnel left pad
 *  keeps room for the same left-side names as desktop. */
export function sankeyGeometry(width: number, kind: 'funnel' | 'referrer') {
  const compact = width < 600;
  const scale = Math.min(1, width / SANKEY_DESKTOP_WIDTH);
  if (kind === 'referrer') {
    return compact
      ? { compact, left: 92, right: 48, top: 12, bottom: 28, nodeWidth: 8, nodeGap: 8, fontSize: 9 }
      : { compact, left: 128, right: 72, top: 20, bottom: 36, nodeWidth: 12, nodeGap: 18, fontSize: 11 };
  }
  if (compact) {
    return {
      compact,
      left: 64,
      right: 72,
      top: 24,
      bottom: 28,
      nodeWidth: 8,
      nodeGap: Math.max(6, Math.round(20 * scale)),
      fontSize: 9,
    };
  }
  return { compact, left: 100, right: 88, top: 24, bottom: 48, nodeWidth: 12, nodeGap: 20, fontSize: 11 };
}
