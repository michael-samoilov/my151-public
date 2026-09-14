import { useECharts, cssVar, tooltipStyle, type EChartsOption, echarts } from './useECharts';
import { nodeDepth, type FunnelLink, type FunnelNode, type FunnelRole } from '@/lib/usageFunnels';
import { sankeyColumnXs, sankeyGeometry } from '@/lib/sankeyGeometry';

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

function chartHeight(nodes: SankeyNode[], links: SankeyLink[], kind: 'funnel' | 'referrer'): number {
  const stack = fattestColumn(nodes, links);
  if (kind === 'referrer') {
    return Math.max(360, Math.min(520, stack * 36 + 80));
  }
  return Math.max(520, Math.min(740, 200 + stack * 80));
}

function nodeLabel(
  n: SankeyNode,
  compact: boolean,
  isLeft: boolean,
  isRight: boolean,
  kind: 'funnel' | 'referrer',
  fat: boolean,
) {
  if (!compact) return { position: n.label, formatter: '{b}' };
  if (kind === 'referrer' && isLeft) {
    return {
      position: 'left' as const,
      width: 88,
      overflow: 'break' as const,
      lineHeight: 11,
      formatter: '{b}',
    };
  }
  if (isLeft) {
    return {
      position: 'top' as const,
      align: 'left' as const,
      width: 72,
      overflow: 'break' as const,
      lineHeight: 11,
      formatter: '{b}',
    };
  }
  if (isRight) {
    return {
      position: n.label,
      width: 76,
      overflow: 'break' as const,
      lineHeight: 11,
      formatter: '{b}',
    };
  }
  if (fat) {
    return {
      position: 'right' as const,
      width: 64,
      overflow: 'break' as const,
      lineHeight: 11,
      formatter: '{b}',
    };
  }
  if (n.role === 'sink' || n.role === 'priv') {
    return {
      position: 'bottom' as const,
      width: 64,
      overflow: 'break' as const,
      lineHeight: 11,
      formatter: '{b}',
    };
  }
  return {
    position: 'top' as const,
    width: 72,
    overflow: 'break' as const,
    lineHeight: 11,
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

const chipKeys = new WeakMap<echarts.ECharts, string>();

function paintCountChips(
  chart: echarts.ECharts,
  nodes: SankeyNode[],
  roleColor: (role?: FunnelRole) => string,
  fontSize: number,
) {
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
    const x = (el.parent?.x ?? originX) + el.shape.x + el.shape.width / 2;
    const y = (el.parent?.y ?? originY) + el.shape.y + el.shape.height / 2;
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
  const key = elements.map((e) => `${String(e.id)}:${String(e.x)}:${String(e.y)}`).join('|');
  if (chipKeys.get(chart) === key) return;
  chipKeys.set(chart, key);
  chart.setOption({ graphic: elements }, { replaceMerge: ['graphic'] });
}

/**
 * MECE usage funnel as a Sankey at every width. On a phone the plot pads and
 * type shrink, early hops sit closer, and counts sit in tight color chips on
 * the bars so a 4- or 5-column funnel stays inside ~390px without a sideways
 * pan.
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
  const height = chartHeight(nodes, links, kind);
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
      const plotWidth = Math.max(1, (el.clientWidth || 360) - g.left - g.right);
      const depths = nodes.map((n) => nodeDepth(n.name, links));
      const maxDepth = Math.max(0, ...depths);
      const xs = sankeyColumnXs(maxDepth, plotWidth, g.nodeWidth, g.compact && kind === 'funnel');

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
            labelLayout: { hideOverlap: false, moveOverlap: 'shiftY' },
            data: nodes.map((n) => ({
              name: n.name,
              localX: g.compact && kind === 'funnel' ? xs[nodeDepth(n.name, links)] / plotWidth : undefined,
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
        paintCountChips(chart, nodes, roleColor, g.fontSize);
      },
    },
  );

  return (
    <div
      ref={ref}
      style={{ height }}
      className="w-full min-w-0 overflow-hidden"
      role="img"
      aria-label={ariaLabel}
    />
  );
}
