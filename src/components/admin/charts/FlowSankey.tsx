import { useCallback } from 'react';
import { useECharts, cssVar, tooltipStyle, type EChartsOption, echarts } from './useECharts';
import { nodeDepth, type FunnelLabelSide, type FunnelLink, type FunnelNode, type FunnelRole } from '@/lib/usageFunnels';
import { sankeyGeometry, sankeyHeightCss } from '@/lib/sankeyGeometry';
import { compactFunnelLabelSide } from '@/lib/sankeyLabels';
import { columnLefts, columnNeeds, fitColumns, type LabelBox, type MeasureText } from '@/lib/sankeyColumns';

type SankeyNode = FunnelNode;
type SankeyLink = FunnelLink;

function fattestColumn(nodes: SankeyNode[], links: SankeyLink[]): number {
  const counts = new Map<number, number>();
  for (const n of nodes) {
    const d = nodeDepth(n.name, links);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return Math.max(2, ...counts.values());
}

const LABEL_DISTANCE = 5;
const CHIP_LABEL_DISTANCE = 3;

const COMPACT_WRAP_EM: Record<ReturnType<typeof compactFunnelLabelSide>, number> = {
  top: 48 / 9,
  bottom: 72 / 9,
  left: 56 / 9,
  right: 80 / 9,
};

function compactTopLabel(fontSize: number, formatter: string) {
  return {
    position: 'top' as const,
    align: 'left' as const,
    verticalAlign: 'bottom' as const,
    distance: 4,
    width: COMPACT_WRAP_EM.top * fontSize,
    overflow: 'break' as const,
    lineHeight: fontSize + 3,
    formatter,
  };
}

function compactLabel(side: ReturnType<typeof compactFunnelLabelSide>, fontSize: number, lines?: string[]) {
  const formatter = lines ? lines.join('\n') : '{b}';
  if (side === 'top') return compactTopLabel(fontSize, formatter);
  if (side === 'bottom') {
    return {
      position: 'bottom' as const,
      width: COMPACT_WRAP_EM.bottom * fontSize,
      overflow: 'break' as const,
      lineHeight: fontSize + 3,
      formatter,
    };
  }
  if (side === 'left') {
    return {
      position: 'left' as const,
      width: COMPACT_WRAP_EM.left * fontSize,
      overflow: 'break' as const,
      lineHeight: fontSize + 3,
      formatter,
    };
  }
  return {
    position: 'right' as const,
    align: 'left' as const,
    width: COMPACT_WRAP_EM.right * fontSize,
    overflow: 'break' as const,
    lineHeight: fontSize + 3,
    formatter,
  };
}

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

function rateLabel(node: SankeyNode): string {
  return node.percentage ? node.percentage.value === null ? '—' : `${Math.round(node.percentage.value)}%` : '';
}

function nodeLabel(
  n: SankeyNode,
  compact: boolean,
  kind: 'funnel' | 'referrer',
  nodes: SankeyNode[],
  links: SankeyLink[],
  roleColor: (role?: FunnelRole) => string,
  fontSize: number,
  lines?: string[],
  crowded = false,
) {
  if (chipInLabel(n, compact, kind, nodes, links) || (crowded && !!n.percentage && nodeDepth(n.name, links) === Math.max(...nodes.map((node) => nodeDepth(node.name, links))))) {
    const value = Math.max(
      links.filter((l) => l.source === n.name).reduce((sum, l) => sum + l.value, 0),
      links.filter((l) => l.target === n.name).reduce((sum, l) => sum + l.value, 0),
    );
    if (n.percentage) {
      const chipWidth = Math.max(labelMeasure(fontSize)(String(Math.round(value))), labelMeasure(Math.max(7, fontSize - 1))(rateLabel(n))) + 4;
      const lead = chipWidth + labelMeasure(fontSize)(' ');
      return {
        ...compactLabel('right', fontSize),
        distance: CHIP_LABEL_DISTANCE + lead,
        width: COMPACT_WRAP_EM.right * fontSize - lead,
        formatter: '{b}',
      };
    }
    return {
      ...compactLabel('right', fontSize),
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
  if (!compact) return { position: n.label, formatter: '{b}' };
  return compactLabel(compactFunnelLabelSide(n, nodes, links), fontSize, lines);
}

type SankeyLayoutSeries = {
  layoutInfo: { x: number; y: number; width: number };
  getGraph(): {
    getNodeById(name: string): { getGraphicEl(): { setTextConfig(config: { offset: number[] }): void }; getLayout(): { x: number; y: number; dx: number; dy: number; value: number } };
  };
};

function percentageLabelOffsets(el: HTMLDivElement, nodes: SankeyNode[], links: SankeyLink[], fontSize: number, crowded = false): Map<string, number> {
  const chart = echarts.getInstanceByDom(el) as unknown as { getModel(): { getSeriesByIndex(i: number): SankeyLayoutSeries } };
  const graph = chart.getModel().getSeriesByIndex(0).getGraph();
  const columns = new Map<number, SankeyNode[]>();
  for (const node of nodes) {
    const depth = nodeDepth(node.name, links);
    columns.set(depth, [...(columns.get(depth) ?? []), node]);
  }
  const offsets = new Map<string, number>();
  for (const column of columns.values()) {
    if (!column.some((n) => n.percentage)) continue;
    const peers = column.map((n) => {
      const bar = graph.getNodeById(n.name).getLayout();
      return { node: n, y: bar.y + bar.dy / 2, spacing: 0 };
    }).sort((a, b) => a.y - b.y);
    peers.forEach((peer, i) => {
      if (i) peer.spacing = peers[i - 1].spacing + fontSize + 3 + (peers[i - 1].node.percentage ? 3 + Math.max(7, fontSize - 1) : 0);
    });
    const blocks: { start: number; end: number; mean: number }[] = [];
    peers.forEach((peer, i) => {
      blocks.push({ start: i, end: i, mean: peer.y - peer.spacing });
      while (blocks.length > 1 && blocks[blocks.length - 2].mean > blocks[blocks.length - 1].mean) {
        const b = blocks.pop()!, a = blocks.pop()!;
        const na = a.end - a.start + 1, nb = b.end - b.start + 1;
        blocks.push({ start: a.start, end: b.end, mean: (a.mean * na + b.mean * nb) / (na + nb) });
      }
    });
    for (const block of blocks) for (const peer of peers.slice(block.start, block.end + 1)) {
      offsets.set(peer.node.name, block.mean + peer.spacing - peer.y);
    }
  }
  if (crowded) {
    const exported = nodes.find((n) => n.name === 'Exported' && links.some((l) => l.source === n.name));
    if (exported) {
      const depth = nodeDepth(exported.name, links);
      const previous = nodes.filter((n) => nodeDepth(n.name, links) === depth - 1);
      const bottom = Math.max(...previous.map((n) => {
        const bar = graph.getNodeById(n.name).getLayout();
        return bar.y + bar.dy;
      }));
      const bar = graph.getNodeById(exported.name).getLayout();
      offsets.set(exported.name, bottom + fontSize + 4 - (bar.y + bar.dy / 2));
      const last = Math.max(...nodes.map((n) => nodeDepth(n.name, links)));
      const privateNodes = nodes.filter((n) => n.role === 'priv' && nodeDepth(n.name, links) === last - 1);
      const start = (privateNodes.length ? Math.max(...privateNodes.map((n) => {
        const layout = graph.getNodeById(n.name).getLayout();
        return layout.y + layout.dy / 2;
      })) : bar.y) + fontSize + 4;
      const terminal = nodes.filter((n) => n.percentage && nodeDepth(n.name, links) === last).map((n) => {
        const layout = graph.getNodeById(n.name).getLayout();
        return { name: n.name, center: layout.y + layout.dy / 2 };
      }).sort((a, b) => a.center - b.center);
      terminal.forEach((n, i) => offsets.set(n.name, start + i * (fontSize + Math.max(7, fontSize - 1) + 7) - n.center));
    }
  }
  return offsets;
}

// platform: ECharts lays out the Sankey before any series renders, and a node's localX share overrides its laid-out x.
function countChip(
  el: HTMLDivElement,
  node: SankeyNode,
  localX: number | undefined,
  side: FunnelLabelSide,
  roleColor: (role?: FunnelRole) => string,
  fontSize: number,
  inlineCount = false,
  labelOffset = 0,
  leader = false,
) {
  const chart = echarts.getInstanceByDom(el) as unknown as { getModel(): { getSeriesByIndex(i: number): SankeyLayoutSeries } };
  const sankey = chart.getModel().getSeriesByIndex(0);
  const graphNode = sankey.getGraph().getNodeById(node.name);
  const bar = graphNode.getLayout();
  graphNode.getGraphicEl().setTextConfig({ offset: [0, labelOffset] });
  const left = sankey.layoutInfo.x + (localX != null ? localX * sankey.layoutInfo.width : bar.x);
  const count = {
    type: 'text' as const,
    x: inlineCount ? left + bar.dx + CHIP_LABEL_DISTANCE : side === 'top' || side === 'bottom' || node.percentage ? left + bar.dx / 2 : left + bar.dx,
    y: sankey.layoutInfo.y + bar.y + bar.dy / 2 + labelOffset,
    style: {
      text: String(Math.round(bar.value)),
      fill: node.role === 'sink' ? '#171717' : '#ffffff',
      fontSize,
      fontWeight: 600,
      backgroundColor: roleColor(node.role),
      padding: [0, 2],
      align: inlineCount ? 'left' as const : side === 'right' && !node.percentage ? ('right' as const) : ('center' as const),
      verticalAlign: 'middle' as const,
    },
  };
  if (!node.percentage) return inlineCount ? { type: 'group' as const, children: [] } : count;
  const rateFont = Math.max(7, fontSize - 1);
  const width = Math.max(labelMeasure(fontSize)(count.style.text), labelMeasure(rateFont)(rateLabel(node))) + 4;
  const center = inlineCount ? count.x + width / 2 : count.x;
  return {
    type: 'group' as const,
    x: 0, y: 0,
    children: [...(leader ? [{
      type: 'line' as const,
      shape: { x1: left + bar.dx / 2, y1: sankey.layoutInfo.y + bar.y + bar.dy, x2: center, y2: count.y - fontSize / 2 - 2 },
      style: { stroke: roleColor(node.role), opacity: 0.25, lineWidth: 0.5 },
    }] : []), {
      type: 'text' as const,
      x: center,
      y: count.y - fontSize / 2,
      style: {
        text: `{count|${count.style.text}}\n{rate|${rateLabel(node)}}`,
        fill: count.style.fill,
        backgroundColor: roleColor(node.role),
        padding: [0, 2],
        width: width - 4,
        align: 'center' as const,
        verticalAlign: 'top' as const,
        fontWeight: 600,
        rich: {
          count: { fontSize, lineHeight: fontSize, align: 'center' as const },
          rate: { fontSize: rateFont, lineHeight: rateFont, align: 'center' as const },
        },
      },
    }],
  };
}

let measureCtx: CanvasRenderingContext2D | null = null;

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

const COMPACT_MIN_FONT_SIZE = 7;
const REFERRER_LABEL_MAX_SHARE = 0.4;
const REFERRER_LABEL_SLACK = 4;

function referrerSourceLabels(nodes: SankeyNode[], links: SankeyLink[], width: number, base: ReturnType<typeof sankeyGeometry>) {
  const sources = nodes.filter((n) => !links.some((l) => l.target === n.name));
  const measure = labelMeasure(base.fontSize);
  const chip = Math.max(0, ...sources.map((n) =>
    measure(String(Math.round(links.filter((l) => l.source === n.name).reduce((sum, l) => sum + l.value, 0)))))) + 4;
  const distance = base.compact ? Math.max(LABEL_DISTANCE, Math.ceil(chip / 2 - base.nodeWidth / 2) + 3) : LABEL_DISTANCE;
  // platform: ECharts truncates a label a few pixels before the box edge, so the box gets that much slack.
  const labelWidth = Math.min(Math.ceil(Math.max(0, ...sources.map((n) => measure(n.name)))) + REFERRER_LABEL_SLACK, Math.floor(width * REFERRER_LABEL_MAX_SHARE));
  return {
    names: new Set(sources.map((n) => n.name)),
    left: Math.max(base.left, labelWidth + distance + 2),
    label: {
      position: 'left' as const,
      distance,
      width: labelWidth,
      overflow: 'truncate' as const,
      ellipsis: '…',
      formatter: '{b}',
    },
  };
}

function funnelLayout(
  nodes: SankeyNode[],
  links: SankeyLink[],
  width: number,
  base: ReturnType<typeof sankeyGeometry>,
): { g: ReturnType<typeof sankeyGeometry>; shares: Map<string, number> | null; lines: Map<string, string[]> } {
  const box = (n: SankeyNode, measure: MeasureText, fontSize: number): LabelBox => {
    const inflow = links.filter((l) => l.target === n.name).reduce((s, l) => s + l.value, 0);
    const outflow = links.filter((l) => l.source === n.name).reduce((s, l) => s + l.value, 0);
    const chip = measure(String(Math.round(Math.max(inflow, outflow)))) + 4;
    if (!base.compact) return { side: n.label, wrap: Number.POSITIVE_INFINITY, distance: LABEL_DISTANCE, chip };
    if (chipInLabel(n, true, 'funnel', nodes, links)) {
      return {
        side: 'right',
        wrap: COMPACT_WRAP_EM.right * fontSize,
        distance: CHIP_LABEL_DISTANCE,
        chip: 0,
        lead: chip + measure(' '),
      };
    }
    const side = compactFunnelLabelSide(n, nodes, links);
    return { side, wrap: COMPACT_WRAP_EM[side] * fontSize, distance: LABEL_DISTANCE, chip };
  };
  const sharesOf = (lefts: number[], plot: number) =>
    new Map(nodes.map((n) => [n.name, lefts[nodeDepth(n.name, links)] / plot]));

  if (!base.compact) {
    const measure = labelMeasure(base.fontSize);
    const plot = width - base.left - base.right;
    const needs = columnNeeds(nodes, links, (n) => box(n, measure, base.fontSize), measure, base.nodeWidth);
    const lefts = columnLefts(needs.gaps, plot, base.nodeWidth);
    return { g: base, shares: lefts && sharesOf(lefts, plot), lines: new Map() };
  }
  const fontSizes: number[] = [];
  for (let size = base.fontSize; size >= COMPACT_MIN_FONT_SIZE; size -= 0.5) fontSizes.push(size);
  const fit = fitColumns(nodes, links, box, labelMeasure, { width, left: base.left, nodeWidth: base.nodeWidth, fontSizes });
  if (!fit) return { g: base, shares: null, lines: new Map() };
  const g = { ...base, fontSize: fit.fontSize, right: fit.right };
  return { g, shares: sharesOf(fit.lefts, width - g.left - g.right), lines: fit.lines };
}

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
  const build = useCallback(
    (el: HTMLDivElement): EChartsOption => {
      const ink = cssVar(el, '--color-foreground', '#0a0a0a');
      const faint = cssVar(el, '--color-muted-foreground', '#737373');
      const success = cssVar(el, '--color-success', '#0b7a54');
      const sink = cssVar(el, '--color-sink', '#8b8b93');
      const priv = cssVar(el, '--color-priv', '#3f5b8a');
      const roleColor = (role?: FunnelRole) =>
        role === 'success' ? success : role === 'sink' ? sink : role === 'priv' ? priv : ink;
      const width = el.clientWidth || 360;
      const base = sankeyGeometry(width, kind);
      const referrer = kind === 'referrer' ? referrerSourceLabels(nodes, links, width, base) : null;
      const { g, shares, lines } = referrer
        ? { g: { ...base, left: referrer.left }, shares: null, lines: new Map<string, string[]>() }
        : funnelLayout(nodes, links, width, base);
      const chips = nodes.filter((n) => n.percentage || !chipInLabel(n, g.compact, kind, nodes, links));

      return {
        animation: false,
        tooltip: {
          ...tooltipStyle(el),
          trigger: 'item',
          formatter: (p: unknown) => {
            const d = p as { dataType: string; name?: string; value?: number; data?: { source?: string; target?: string } };
            if (d.dataType === 'edge' && d.data) return `${d.data.source} → ${d.data.target}<br/><b>${d.value}</b>`;
            const node = nodes.find((n) => n.name === d.name);
            return `${d.name}<br/><b>${d.value}</b>${node?.percentage ? `<br/>${rateLabel(node)} of ${node.percentage.basis}` : ''}`;
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
              label: referrer?.names.has(n.name)
                ? referrer.label
                : nodeLabel(n, g.compact, kind, nodes, links, roleColor, g.fontSize, lines.get(n.name), g.compact && !shares && links.some((l) => l.source === 'Exported')),
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
              return countChip(el, n, shares?.get(n.name), side, roleColor, g.fontSize, chipInLabel(n, g.compact, kind, nodes, links) || (g.compact && !!n.percentage && nodeDepth(n.name, links) === Math.max(...nodes.map((node) => nodeDepth(node.name, links)))), g.compact && kind === 'funnel' ? percentageLabelOffsets(el, nodes, links, g.fontSize, !shares).get(n.name) ?? 0 : 0, g.compact && !shares && links.some((l) => l.source === 'Exported') && !!n.percentage && (links.some((l) => l.source === n.name) || nodeDepth(n.name, links) === Math.max(...nodes.map((node) => nodeDepth(node.name, links)))));
            },
          },
        ],
      };
    },
    [nodes, links, kind, labelHalo],
  );
  const ref = useECharts(build);

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
