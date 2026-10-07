import { useECharts, cssVar, tooltipStyle, type EChartsOption, echarts } from './useECharts';
import { nodeDepth, type FunnelLabelSide, type FunnelLink, type FunnelNode, type FunnelRole } from '@/lib/usageFunnels';
import { sankeyGeometry, sankeyHeightCss } from '@/lib/sankeyGeometry';
import { compactFunnelLabelSide } from '@/lib/sankeyLabels';
import { columnLefts, gapNeeds, type LabelBox } from '@/lib/sankeyColumns';

export type SankeyNode = FunnelNode;
export type SankeyLink = FunnelLink;

function fattestColumn(nodes: SankeyNode[], links: SankeyLink[]): number {
  const counts = new Map<number, number>();
  for (const n of nodes) {
    const d = nodeDepth(n.name, links);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return Math.max(2, ...counts.values());
}

/** echarts' own gap between a node and its label. */
const LABEL_DISTANCE = 5;
/** The last column's gap, which holds its count chip in the label instead. */
const CHIP_LABEL_DISTANCE = 3;

/** Width each compact label wraps at, by side. */
const COMPACT_WRAP: Record<ReturnType<typeof compactFunnelLabelSide>, number> = {
  top: 48,
  bottom: 72,
  left: 56,
  right: 80,
};

function compactTopLabel() {
  return {
    position: 'top' as const,
    align: 'left' as const,
    verticalAlign: 'bottom' as const,
    distance: 4,
    width: COMPACT_WRAP.top,
    overflow: 'break' as const,
    lineHeight: 12,
    formatter: '{b}',
  };
}

function compactLabel(side: ReturnType<typeof compactFunnelLabelSide>) {
  if (side === 'top') return compactTopLabel();
  if (side === 'bottom') {
    return {
      position: 'bottom' as const,
      width: COMPACT_WRAP.bottom,
      overflow: 'break' as const,
      lineHeight: 12,
      formatter: '{b}',
    };
  }
  if (side === 'left') {
    return {
      position: 'left' as const,
      width: COMPACT_WRAP.left,
      overflow: 'break' as const,
      lineHeight: 12,
      formatter: '{b}',
    };
  }
  return {
    position: 'right' as const,
    align: 'left' as const,
    width: COMPACT_WRAP.right,
    overflow: 'break' as const,
    lineHeight: 12,
    formatter: '{b}',
  };
}

/** On a phone funnel, the last column's count sits in its label, right of
 *  the bar. A chip on the bar would reach left over the previous column's
 *  names, and the last column has no outgoing flow on its right. */
function chipInLabel(
  n: SankeyNode,
  compact: boolean,
  kind: 'funnel' | 'referrer',
  nodes: SankeyNode[],
  links: SankeyLink[],
): boolean {
  if (!compact || kind !== 'funnel') return false;
  const last = Math.max(...nodes.map((m) => nodeDepth(m.name, links)));
  return nodeDepth(n.name, links) === last && compactFunnelLabelSide(n, nodes, links) === 'right';
}

function nodeLabel(
  n: SankeyNode,
  compact: boolean,
  kind: 'funnel' | 'referrer',
  nodes: SankeyNode[],
  links: SankeyLink[],
  roleColor: (role?: FunnelRole) => string,
  fontSize: number,
) {
  if (chipInLabel(n, compact, kind, nodes, links)) {
    return {
      ...compactLabel('right'),
      distance: CHIP_LABEL_DISTANCE,
      formatter: (p: { name: string; value?: number }) => `{chip|${Math.round(p.value ?? 0)}} ${p.name}`,
      rich: {
        chip: {
          backgroundColor: roleColor(n.role),
          color: n.role === 'sink' ? '#171717' : '#ffffff',
          fontSize,
          fontWeight: 600,
          padding: [0, 2],
          textBorderWidth: 0,
        },
      },
    };
  }
  if (kind === 'referrer' && compact && !links.some((l) => l.target === n.name)) {
    return {
      position: 'left' as const,
      width: 88,
      overflow: 'break' as const,
      lineHeight: 11,
      formatter: '{b}',
    };
  }
  if (!compact) return { position: n.label, formatter: '{b}' };
  return compactLabel(compactFunnelLabelSide(n, nodes, links));
}

type SankeyLayoutSeries = {
  layoutInfo: { x: number; y: number; width: number };
  getGraph(): {
    getNodeById(name: string): { getLayout(): { x: number; y: number; dx: number; dy: number; value: number } };
  };
};

/**
 * A node's count chip, drawn by a custom series in the same pass as the
 * Sankey, so every frame that shows the bars shows their counts. echarts lays
 * the Sankey out before it renders any series, so the node's layout is ready.
 * Like echarts' Sankey view, a node's `localX` share of the plot width wins
 * over the laid-out x. A right label's chip ends at the bar's right edge, a
 * left label's chip centers on that edge, and a top or bottom label's chip
 * centers on the bar.
 */
function countChip(
  el: HTMLDivElement,
  node: SankeyNode,
  localX: number | undefined,
  side: FunnelLabelSide,
  roleColor: (role?: FunnelRole) => string,
  fontSize: number,
) {
  const chart = echarts.getInstanceByDom(el) as unknown as { getModel(): { getSeriesByIndex(i: number): SankeyLayoutSeries } };
  const sankey = chart.getModel().getSeriesByIndex(0);
  const bar = sankey.getGraph().getNodeById(node.name).getLayout();
  const left = sankey.layoutInfo.x + (localX != null ? localX * sankey.layoutInfo.width : bar.x);
  return {
    type: 'text' as const,
    x: side === 'top' || side === 'bottom' ? left + bar.dx / 2 : left + bar.dx,
    y: sankey.layoutInfo.y + bar.y + bar.dy / 2,
    style: {
      text: String(Math.round(bar.value)),
      fill: node.role === 'sink' ? '#171717' : '#ffffff',
      fontSize,
      fontWeight: 600,
      backgroundColor: roleColor(node.role),
      padding: [0, 2],
      align: side === 'right' ? ('right' as const) : ('center' as const),
      verticalAlign: 'middle' as const,
    },
  };
}

let measureCtx: CanvasRenderingContext2D | null = null;

/** Label text width in px, measured the way echarts draws it. */
function labelMeasure(fontSize: number): (text: string) => number {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  const ctx = measureCtx;
  const font = `600 ${fontSize}px sans-serif`;
  return (text) => {
    if (!ctx) return text.length * fontSize * 0.6;
    ctx.font = font;
    return ctx.measureText(text).width;
  };
}

/** Each node's `localX`: its column's left edge as a share of the plot
 *  width, spaced so no column's labels run into the next column. Null when
 *  the plot is too narrow for that, and echarts spaces the columns evenly. */
function columnShares(
  nodes: SankeyNode[],
  links: SankeyLink[],
  width: number,
  g: ReturnType<typeof sankeyGeometry>,
): Map<string, number> | null {
  const measure = labelMeasure(g.fontSize);
  const chip = (n: SankeyNode) => {
    const inflow = links.filter((l) => l.target === n.name).reduce((s, l) => s + l.value, 0);
    const outflow = links.filter((l) => l.source === n.name).reduce((s, l) => s + l.value, 0);
    // paintCountChips pads the count by 2px on each side.
    return measure(String(Math.round(Math.max(inflow, outflow)))) + 4;
  };
  const box = (n: SankeyNode): LabelBox => {
    if (!g.compact) return { side: n.label, wrap: Number.POSITIVE_INFINITY, distance: LABEL_DISTANCE, chip: chip(n) };
    if (chipInLabel(n, true, 'funnel', nodes, links)) {
      return { side: 'right', wrap: COMPACT_WRAP.right, distance: CHIP_LABEL_DISTANCE, chip: 0 };
    }
    const side = compactFunnelLabelSide(n, nodes, links);
    return { side, wrap: COMPACT_WRAP[side], distance: LABEL_DISTANCE, chip: chip(n) };
  };
  const plot = width - g.left - g.right;
  const lefts = columnLefts(gapNeeds(nodes, links, box, measure, g.nodeWidth), plot, g.nodeWidth);
  if (!lefts) return null;
  return new Map(nodes.map((n) => [n.name, lefts[nodeDepth(n.name, links)] / plot]));
}

/**
 * MECE usage funnel as a Sankey at every width. On a phone the plot is
 * wider than it is tall, first-stage names sit on the bar, column titles
 * sit along the top, and stacked peers sit to the right so a short bar
 * cannot drop a name onto the next one. Counts sit in color chips on the bars.
 */
export function FlowSankey({
  nodes,
  links,
  ariaLabel,
  kind = 'funnel',
  labelHalo = false,
}: {
  nodes: SankeyNode[];
  links: SankeyLink[];
  ariaLabel: string;
  kind?: 'funnel' | 'referrer';
  labelHalo?: boolean;
}) {
  const stack = fattestColumn(nodes, links);
  const ref = useECharts(
    (el): EChartsOption => {
      const ink = cssVar(el, '--color-foreground', '#0a0a0a');
      const faint = cssVar(el, '--color-muted-foreground', '#737373');
      const success = cssVar(el, '--color-success', '#0b7a54');
      const sink = cssVar(el, '--color-sink', '#8b8b93');
      const priv = cssVar(el, '--color-priv', '#3f5b8a');
      const roleColor = (role?: FunnelRole) =>
        role === 'success' ? success : role === 'sink' ? sink : role === 'priv' ? priv : ink;
      const g = sankeyGeometry(el.clientWidth || 360, kind);
      const shares = kind === 'funnel' ? columnShares(nodes, links, el.clientWidth || 360, g) : null;
      const chips = nodes.filter((n) => !chipInLabel(n, g.compact, kind, nodes, links));

      return {
        animation: false,
        tooltip: {
          ...tooltipStyle(el),
          trigger: 'item',
          formatter: (p: unknown) => {
            const d = p as { dataType: string; name?: string; value?: number; data?: { source?: string; target?: string } };
            if (d.dataType === 'edge' && d.data) return `${d.data.source} → ${d.data.target}<br/><b>${d.value}</b>`;
            return `${d.name}<br/><b>${d.value}</b>`;
          },
        },
        series: [
          {
            type: 'sankey',
            left: g.left,
            right: g.right,
            top: g.top,
            bottom: g.bottom,
            nodeGap: g.nodeGap,
            nodeWidth: g.nodeWidth,
            draggable: false,
            layoutIterations: 0,
            nodeAlign: 'left',
            emphasis: { focus: 'adjacency' },
            label: {
              color: ink,
              fontSize: g.fontSize,
              fontWeight: 600,
              formatter: '{b}',
              lineHeight: g.fontSize + 2,
              ...(labelHalo ? { textBorderColor: cssVar(el, '--color-card', '#ffffff'), textBorderWidth: 3 } : {}),
            },
            labelLayout: { hideOverlap: false, moveOverlap: 'shiftY' },
            data: nodes.map((n) => ({
              name: n.name,
              localX: shares?.get(n.name),
              itemStyle: { color: roleColor(n.role), borderColor: roleColor(n.role) },
              label: nodeLabel(n, g.compact, kind, nodes, links, roleColor, g.fontSize),
            })),
            links: links.map((l) => ({
              source: l.source,
              target: l.target,
              value: l.value,
              lineStyle: { color: roleColor(l.role ?? 'neutral'), opacity: 0.28 },
            })),
            lineStyle: { color: faint, opacity: 0.25, curveness: 0.5 },
          },
          {
            type: 'custom',
            coordinateSystem: 'none',
            silent: true,
            z: 100,
            data: chips.map((_, i) => i),
            renderItem: (params: { dataIndex: number }) => {
              const n = chips[params.dataIndex];
              const side = g.compact ? compactFunnelLabelSide(n, nodes, links) : n.label;
              return countChip(el, n, shares?.get(n.name), side, roleColor, g.fontSize);
            },
          },
        ],
      };
    },
    [nodes, links, kind, labelHalo],
  );

  return (
    <div className="w-full min-w-0" style={{ containerType: 'inline-size' }}>
      <div
        ref={ref}
        style={{ height: sankeyHeightCss(stack, kind) }}
        className="w-full min-w-0 overflow-hidden"
        role="img"
        aria-label={ariaLabel}
      />
    </div>
  );
}
