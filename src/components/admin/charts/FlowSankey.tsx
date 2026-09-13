import { useECharts, cssVar, tooltipStyle, type EChartsOption } from './useECharts';
import { nodeDepth, type FunnelLink, type FunnelNode } from '@/lib/usageFunnels';

export type SankeyNode = FunnelNode;
export type SankeyLink = FunnelLink;

function columnStack(nodes: SankeyNode[], links: SankeyLink[]): number {
  const sources = new Set(links.map((l) => l.source));
  const targets = new Set(links.map((l) => l.target));
  const leftmost = nodes.filter((n) => !targets.has(n.name)).length;
  const rightmost = nodes.filter((n) => !sources.has(n.name)).length;
  return Math.max(2, leftmost, rightmost);
}

function columnCount(nodes: SankeyNode[], links: SankeyLink[]): number {
  if (links.length === 0) return 1;
  return 1 + Math.max(...nodes.map((n) => nodeDepth(n.name, links)));
}

function chartHeight(nodes: SankeyNode[], links: SankeyLink[]): number {
  return Math.max(360, Math.min(580, columnStack(nodes, links) * 42 + 80));
}

function chartMinWidth(nodes: SankeyNode[], links: SankeyLink[]): number | undefined {
  const cols = columnCount(nodes, links);
  if (cols < 6) return undefined;
  return cols * 110;
}

/**
 * MECE usage-funnel Sankey. Every inflow is accounted for by named sinks, so
 * the ribbon widths conserve at each node. Colors carry outcome meaning: gains
 * are success-green, attrition and kept-private are muted, the trunk stays
 * neutral ink. No red — that is reserved for data-movement elsewhere.
 *
 * Labels sit on the outside of the first and last columns, and above/below
 * the bar in middle columns, so a label stays next to its own node instead of
 * colliding in the gutter between columns.
 */
export function FlowSankey({
  nodes,
  links,
  ariaLabel,
}: {
  nodes: SankeyNode[];
  links: SankeyLink[];
  ariaLabel: string;
}) {
  const height = chartHeight(nodes, links);
  const minWidth = chartMinWidth(nodes, links);
  const ref = useECharts(
    (el): EChartsOption => {
      const ink = cssVar(el, '--color-foreground', '#0a0a0a');
      const faint = cssVar(el, '--color-muted-foreground', '#737373');
      const success = cssVar(el, '--color-success', '#0b7a54');
      const sink = cssVar(el, '--color-sink', '#8b8b93');
      const priv = cssVar(el, '--color-priv', '#3f5b8a');
      const w = el.clientWidth;
      const leftPad = w < 500 ? 72 : 108;
      const rightPad = w < 500 ? 64 : 96;
      const fontSize = w < 500 ? 10 : 11;
      const roleColor = (role?: string) =>
        role === 'success' ? success : role === 'sink' ? sink : role === 'priv' ? priv : ink;

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
            left: leftPad,
            right: rightPad,
            top: 28,
            bottom: 28,
            nodeGap: 22,
            nodeWidth: 12,
            draggable: false,
            layoutIterations: 0,
            nodeAlign: 'left',
            emphasis: { focus: 'adjacency' },
            label: {
              color: ink,
              fontSize,
              fontWeight: 600,
              formatter: '{b} {c}',
            },
            labelLayout: { hideOverlap: false, moveOverlap: 'shiftY' },
            data: nodes.map((n) => ({
              name: n.name,
              itemStyle: { color: roleColor(n.role), borderColor: roleColor(n.role) },
              label: { position: n.label ?? 'right' },
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
    [nodes, links],
  );

  return (
    <div className="w-full overflow-x-auto">
      <div
        ref={ref}
        style={{ height, minWidth }}
        className="w-full"
        role="img"
        aria-label={ariaLabel}
      />
    </div>
  );
}
