/** md breakpoint. Below this, a funnel's plot is wider than it is tall,
 *  matching the desktop Sankey shape rather than the card's aspect. */
const SANKEY_DESKTOP_WIDTH = 1024;

/** Plot width / plot height on a phone funnel. Desktop sits near 2.2. */
const FUNNEL_PLOT_ASPECT = 1.5;

function sankeyDesktopHeight(stack: number, kind: 'funnel' | 'referrer'): number {
  if (kind === 'referrer') return Math.max(360, Math.min(520, stack * 36 + 80));
  return Math.max(520, Math.min(740, 200 + stack * 80));
}

function sankeyMinHeight(kind: 'funnel' | 'referrer'): number {
  return kind === 'referrer' ? 160 : 180;
}

export function sankeyHeightCss(stack: number, kind: 'funnel' | 'referrer'): string {
  const desktopH = sankeyDesktopHeight(stack, kind);
  if (kind === 'referrer') {
    const minH = sankeyMinHeight(kind);
    return `max(${minH}px, min(${desktopH}px, calc(100cqw * ${desktopH} / ${SANKEY_DESKTOP_WIDTH})))`;
  }
  const g = sankeyGeometry(360, 'funnel');
  const minPlot = stack * 10 + Math.max(0, stack - 1) * g.nodeGap;
  const minH = minPlot + g.top + g.bottom;
  const pads = g.left + g.right;
  const chrome = g.top + g.bottom;
  return `max(${minH}px, min(${desktopH}px, calc((100cqw - ${pads}px) / ${FUNNEL_PLOT_ASPECT} + ${chrome}px)))`;
}

/** Insets and type that fit the chart's own width. Compact kicks in when
 *  desktop pads would leave a 5-column funnel too little plot. Counts sit
 *  in the bars. First-stage names sit on top of the bar, so the left pad
 *  only needs a hairline. Leaf names sit to the right. Top pad holds two
 *  lines so "Placed a Pokémon" is not clipped. */
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
      left: 8,
      right: 84,
      top: 52,
      bottom: 28,
      nodeWidth: 8,
      nodeGap: Math.max(6, Math.round(20 * scale)),
      fontSize: 9,
    };
  }
  return { compact, left: 100, right: 88, top: 24, bottom: 48, nodeWidth: 12, nodeGap: 20, fontSize: 11 };
}
