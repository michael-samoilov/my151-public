import { useECharts, cssVar, tooltipStyle, type EChartsOption, echarts } from './useECharts';
import { nodeDepth, type FunnelLink, type FunnelNode, type FunnelRole } from '@/lib/usageFunnels';
import { sankeyGeometry, sankeyHeightCss } from '@/lib/sankeyGeometry';

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

function fatColumnNames(nodes: SankeyNode[], links: SankeyLink[]): Set<string> {
  const byDepth = new Map<number, string[]>();
  for (const n of nodes) {
    const d = nodeDepth(n.name, links);
    const arr = byDepth.get(d) ?? [];
    arr.push(n.name);
    byDepth.set(d, arr);
  }
  const fat = new Set<string>();
  for (const arr of byDepth.values()) {
    if (arr.length >= 4) for (const name of arr) fat.add(name);
  }
  return fat;
}

function compactTopLabel() {
  return {
    position: 'top' as const,
    align: 'left' as const,
    verticalAlign: 'bottom' as const,
    distance: 4,
    width: 48,
    overflow: 'break' as const,
    lineHeight: 12,
    formatter: '{b}',
  };
}

function nodeLabel(
  n: SankeyNode,
  compact: boolean,
  isSource: boolean,
  isLeaf: boolean,
  kind: 'funnel' | 'referrer',
  fat: boolean,
) {
  if (kind === 'referrer' && compact && isSource) {
    return {
      position: 'left' as const,
      width: 88,
      overflow: 'break' as const,
      lineHeight: 11,
      formatter: '{b}',
    };
  }
  if (!compact) return { position: n.label, formatter: '{b}' };
  if (isSource) return compactTopLabel();
  if (isLeaf) {
    if (n.role === 'sink') {
      return {
        position: 'bottom' as const,
        width: 72,
        overflow: 'break' as const,
        lineHeight: 12,
        formatter: '{b}',
      };
    }
    return {
      position: 'right' as const,
      width: 80,
      overflow: 'break' as const,
      lineHeight: 12,
      formatter: '{b}',
    };
  }
  if (n.role === 'success') return compactTopLabel();
  if (fat) {
    return {
      position: 'right' as const,
      width: 72,
      overflow: 'break' as const,
      lineHeight: 12,
      formatter: '{b}',
    };
  }
  if (n.label === 'top' || n.label === 'left') return compactTopLabel();
  return {
    position: n.label,
    width: 72,
    overflow: 'break' as const,
    lineHeight: 12,
    formatter: '{b}',
  };
}

type SankeyNodeData = {
  each: (cb: (idx: number) => void) => void;
  getName: (idx: number) => string;
  getItemLayout: (idx: number) => { value?: number } | undefined;
  getItemGraphicEl: (idx: number) => {
    shape?: { x: number; y: number; width: number; height: number };
    parent?: { x?: number; y?: number };
  } | undefined;
};

const chipTimers = new WeakMap<echarts.ECharts, number>();
const paintingGraphic = new WeakSet<echarts.ECharts>();

function paintCountChips(
  chart: echarts.ECharts,
  nodes: SankeyNode[],
  roleColor: (role?: FunnelRole) => string,
  fontSize: number,
  compact: boolean,
) {
  if (paintingGraphic.has(chart)) return;
  const model = (chart as unknown as { getModel(): { getSeriesByIndex(i: number): unknown } }).getModel();
  const series = model.getSeriesByIndex(0) as
    | { getData(): SankeyNodeData; layoutInfo?: { x: number; y: number } }
    | undefined;
  if (!series) return;
  const nodeData = series.getData();
  const originX = series.layoutInfo?.x ?? 0;
  const originY = series.layoutInfo?.y ?? 0;
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const elements: Array<Record<string, unknown>> = [];
  nodeData.each((idx) => {
    const name = nodeData.getName(idx);
    const node = byName.get(name);
    const value = nodeData.getItemLayout(idx)?.value;
    const el = nodeData.getItemGraphicEl(idx);
    if (value == null || !el?.shape) return;
    const ox = el.parent?.x ?? originX;
    const oy = el.parent?.y ?? originY;
    const x =
      node?.label === 'left' && !compact
        ? ox + el.shape.x + el.shape.width
        : ox + el.shape.x + el.shape.width / 2;
    const y = oy + el.shape.y + el.shape.height / 2;
    const fill = roleColor(node?.role);
    elements.push({
      type: 'text',
      id: `count-${name}`,
      silent: true,
      z: 100,
      x,
      y,
      style: {
        text: String(Math.round(value)),
        fill: node?.role === 'sink' ? '#171717' : '#ffffff',
        fontSize,
        fontWeight: 600,
        backgroundColor: fill,
        padding: [0, 2],
        align: 'center',
        verticalAlign: 'middle',
      },
    });
  });
  if (elements.length === 0) return;
  const prev = chipTimers.get(chart);
  if (prev) window.clearTimeout(prev);
  const id = window.setTimeout(() => {
    chipTimers.delete(chart);
    paintingGraphic.add(chart);
    chart.setOption({ graphic: elements });
    window.setTimeout(() => paintingGraphic.delete(chart), 0);
  }, 50);
  chipTimers.set(chart, id);
}

/**
 * MECE usage funnel as a Sankey at every width. On a phone the plot is
 * wider than it is tall, first-stage names sit on the bar, column titles
 * sit along the top, and leaf names sit to the right. Counts sit in color
 * chips on the bars.
 */
export function FlowSankey({
  nodes,
  links,
  ariaLabel,
  kind = 'funnel',
}: {
  nodes: SankeyNode[];
  links: SankeyLink[];
  ariaLabel: string;
  kind?: 'funnel' | 'referrer';
}) {
  const stack = fattestColumn(nodes, links);
  const sources = new Set(links.map((l) => l.source));
  const targets = new Set(links.map((l) => l.target));
  const fat = fatColumnNames(nodes, links);
  const ref = useECharts(
    (el): EChartsOption => {
      const ink = cssVar(el, '--color-foreground', '#0a0a0a');
      const faint = cssVar(el, '--color-muted-foreground', '#737373');
      const success = cssVar(el, '--color-success', '#0b7a54');
      const sink = cssVar(el, '--color-sink', '#8b8b93');
      const priv = cssVar(el, '--color-priv', '#3f5b8a');
      const roleColor = (role?: string) =>
        role === 'success' ? success : role === 'sink' ? sink : role === 'priv' ? priv : ink;
      const g = sankeyGeometry(el.clientWidth || 360, kind);

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
            },
              labelLayout: g.compact ? { hideOverlap: false } : { hideOverlap: false, moveOverlap: 'shiftY' },
              data: nodes.map((n) => ({
              name: n.name,
              itemStyle: { color: roleColor(n.role), borderColor: roleColor(n.role) },
              label: nodeLabel(n, g.compact, !targets.has(n.name), !sources.has(n.name), kind, fat.has(n.name)),
            })),
            links: links.map((l) => ({
              source: l.source,
              target: l.target,
              value: l.value,
              lineStyle: { color: roleColor(l.role ?? 'neutral'), opacity: 0.28 },
            })),
            lineStyle: { color: faint, opacity: 0.25, curveness: 0.5 },
          },
        ],
      };
    },
    [nodes, links, kind],
    {
      afterRender: (chart, el) => {
        const ink = cssVar(el, '--color-foreground', '#0a0a0a');
        const success = cssVar(el, '--color-success', '#0b7a54');
        const sink = cssVar(el, '--color-sink', '#8b8b93');
        const priv = cssVar(el, '--color-priv', '#3f5b8a');
        const roleColor = (role?: FunnelRole) =>
          role === 'success' ? success : role === 'sink' ? sink : role === 'priv' ? priv : ink;
        const g = sankeyGeometry(el.clientWidth || 360, kind);
        paintCountChips(chart, nodes, roleColor, g.fontSize, g.compact);
      },
    },
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
