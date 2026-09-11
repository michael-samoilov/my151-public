import { useECharts, cssVar, type EChartsOption } from './useECharts';

export interface SankeyNode {
  name: string;
  /** Semantic role → color. Omit for the neutral ink default. */
  role?: 'success' | 'sink' | 'priv' | 'neutral';
}
export interface SankeyLink {
  source: string;
  target: string;
  value: number;
  role?: 'success' | 'sink' | 'priv' | 'neutral';
}

/**
 * MECE usage-funnel Sankey, matching the reviewed design. Every inflow is
 * accounted for by named sinks, so the ribbon widths conserve at each node.
 * Colors carry outcome meaning: gains are success-green, attrition and
 * kept-private are muted, the trunk stays neutral ink. No red — that is
 * reserved for data-movement elsewhere.
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
  const ref = useECharts(
    (el): EChartsOption => {
      const ink = cssVar(el, '--color-foreground', '#0a0a0a');
      const faint = cssVar(el, '--color-muted-foreground', '#737373');
      const surface = cssVar(el, '--color-card', '#ffffff');
      const success = cssVar(el, '--color-success', '#0b7a54');
      const sink = cssVar(el, '--color-sink', '#8b8b93');
      const priv = cssVar(el, '--color-priv', '#3f5b8a');
      const roleColor = (role?: string) =>
        role === 'success' ? success : role === 'sink' ? sink : role === 'priv' ? priv : ink;
      // Terminal nodes (never a link source) label to their left so the text
      // stays inside the canvas; upstream nodes label to their right.
      const sources = new Set(links.map((l) => l.source));

      return {
        animation: false,
        tooltip: {
          trigger: 'item',
          backgroundColor: ink,
          borderWidth: 0,
          textStyle: { color: surface, fontSize: 11 },
          formatter: (p: unknown) => {
            const d = p as { dataType: string; name?: string; value?: number; data?: { source?: string; target?: string } };
            if (d.dataType === 'edge' && d.data) return `${d.data.source} → ${d.data.target}<br/><b>${d.value}</b>`;
            return `${d.name}<br/><b>${d.value}</b>`;
          },
        },
        series: [
          {
            type: 'sankey',
            left: 10,
            right: 10,
            top: 14,
            bottom: 14,
            nodeGap: 16,
            nodeWidth: 12,
            draggable: false,
            emphasis: { focus: 'adjacency' },
            label: { color: ink, fontSize: 11, fontWeight: 600, formatter: '{b} {c}' },
            data: nodes.map((n) => ({
              name: n.name,
              itemStyle: { color: roleColor(n.role), borderColor: roleColor(n.role) },
              label: { position: sources.has(n.name) ? 'right' : 'left' },
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

  return <div ref={ref} className="h-[260px] w-full md:h-[300px]" role="img" aria-label={ariaLabel} />;
}
