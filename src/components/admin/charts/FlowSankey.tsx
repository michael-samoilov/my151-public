import { useECharts, cssVar, tooltipStyle, type EChartsOption } from './useECharts';
import { type FunnelLink, type FunnelNode } from '@/lib/usageFunnels';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { PhoneFunnel, PhoneReferrer } from './PhoneFlow';

export type SankeyNode = FunnelNode;
export type SankeyLink = FunnelLink;

function columnStack(nodes: SankeyNode[], links: SankeyLink[]): number {
  const sources = new Set(links.map((l) => l.source));
  const targets = new Set(links.map((l) => l.target));
  const leftmost = nodes.filter((n) => !targets.has(n.name)).length;
  const rightmost = nodes.filter((n) => !sources.has(n.name)).length;
  return Math.max(2, leftmost, rightmost);
}

function chartHeight(nodes: SankeyNode[], links: SankeyLink[]): number {
  return Math.max(360, Math.min(580, columnStack(nodes, links) * 42 + 80));
}

function DesktopSankey({
  nodes,
  links,
  ariaLabel,
}: {
  nodes: SankeyNode[];
  links: SankeyLink[];
  ariaLabel: string;
}) {
  const height = chartHeight(nodes, links);
  const ref = useECharts(
    (el): EChartsOption => {
      const ink = cssVar(el, '--color-foreground', '#0a0a0a');
      const faint = cssVar(el, '--color-muted-foreground', '#737373');
      const success = cssVar(el, '--color-success', '#0b7a54');
      const sink = cssVar(el, '--color-sink', '#8b8b93');
      const priv = cssVar(el, '--color-priv', '#3f5b8a');
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
            left: 108,
            right: 96,
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
              fontSize: 11,
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
    <div
      ref={ref}
      style={{ height }}
      className="w-full min-w-0"
      role="img"
      aria-label={ariaLabel}
    />
  );
}

/**
 * MECE usage funnel. On desktop this is a Sankey: earlier peels sit further
 * left, labels sit on their own node. On a phone the same data is a wrapping
 * labeled-bar list, because an 8-column Sankey cannot keep those labels
 * readable at ~390px without sideways pan.
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
  const isDesktop = useIsDesktop();
  if (!isDesktop) {
    if (kind === 'referrer') {
      return (
        <div className="min-w-0 w-full">
          <PhoneReferrer links={links} ariaLabel={ariaLabel} />
        </div>
      );
    }
    return (
      <div className="min-w-0 w-full">
        <PhoneFunnel nodes={nodes} links={links} ariaLabel={ariaLabel} />
      </div>
    );
  }

  return <DesktopSankey nodes={nodes} links={links} ariaLabel={ariaLabel} />;
}
