import { useECharts, cssVar, tooltipStyle, type EChartsOption } from './useECharts';
import { type FunnelLink, type FunnelNode } from '@/lib/usageFunnels';
import { sankeyGeometry } from '@/lib/sankeyGeometry';

export type SankeyNode = FunnelNode;
export type SankeyLink = FunnelLink;

function columnStack(nodes: SankeyNode[], links: SankeyLink[]): number {
  const sources = new Set(links.map((l) => l.source));
  const targets = new Set(links.map((l) => l.target));
  const leftmost = nodes.filter((n) => !targets.has(n.name)).length;
  const rightmost = nodes.filter((n) => !sources.has(n.name)).length;
  return Math.max(2, leftmost, rightmost);
}

function chartHeight(nodes: SankeyNode[], links: SankeyLink[], kind: 'funnel' | 'referrer'): number {
  if (kind === 'referrer') {
    return Math.max(360, Math.min(520, columnStack(nodes, links) * 36 + 80));
  }
  const peels = nodes.filter((n) => n.role === 'sink').length;
  return Math.max(500, Math.min(640, 360 + peels * 28));
}

function nodeLabel(
  n: SankeyNode,
  compact: boolean,
  isLeft: boolean,
  isRight: boolean,
  kind: 'funnel' | 'referrer',
) {
  const countFmt = compact ? '{b}\n{c}' : '{b} {c}';
  if (!compact) return { position: n.label };
  if (kind === 'referrer' && isLeft) {
    return {
      position: 'left' as const,
      width: 88,
      overflow: 'break' as const,
      lineHeight: 11,
      formatter: countFmt,
    };
  }
  // Intermediate through-nodes (Built, 31+, 4+ cards, …) skip labels on a
  // phone so adjacent top captions do not collide. Peels, start, and
  // outcomes keep their names.
  if (n.role === 'neutral' && !isLeft) return { show: false };
  if (isLeft) {
    return {
      position: 'top' as const,
      align: 'left' as const,
      width: 72,
      overflow: 'break' as const,
      lineHeight: 11,
      formatter: countFmt,
    };
  }
  if (isRight) {
    return {
      position: n.role === 'priv' || n.role === 'sink' ? ('bottom' as const) : ('right' as const),
      width: 76,
      overflow: 'break' as const,
      lineHeight: 11,
      formatter: countFmt,
    };
  }
  if (n.role === 'sink' || n.role === 'priv') {
    return {
      position: 'bottom' as const,
      width: 64,
      overflow: 'break' as const,
      lineHeight: 11,
      formatter: countFmt,
    };
  }
  return {
    position: 'top' as const,
    width: 72,
    overflow: 'break' as const,
    lineHeight: 11,
    formatter: countFmt,
  };
}

/**
 * MECE usage funnel as a Sankey at every width. On a phone the plot pads and
 * type shrink, and stage labels sit above or below their nodes, so an
 * 8-column funnel stays inside ~390px without a sideways pan.
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
              formatter: g.compact ? '{b}\n{c}' : '{b} {c}',
              lineHeight: g.fontSize + 2,
            },
            labelLayout: { hideOverlap: false, moveOverlap: 'shiftY' },
            data: nodes.map((n) => ({
              name: n.name,
              itemStyle: { color: roleColor(n.role), borderColor: roleColor(n.role) },
              label: nodeLabel(n, g.compact, !targets.has(n.name), !sources.has(n.name), kind),
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
