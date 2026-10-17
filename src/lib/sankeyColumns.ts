import { nodeDepth, type FunnelLabelSide, type FunnelLink, type FunnelNode } from './usageFunnels';

export interface LabelBox {
  side: FunnelLabelSide;
  wrap: number;
  distance: number;
  chip: number;
  lead?: number;
  lines?: string[];
}

export type MeasureText = (text: string) => number;

const LABEL_MARGIN = 3;
const HEADER_MARGIN = 6;

function wrappedWidth(text: string, wrap: number, measure: MeasureText): number {
  let widest = 0;
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > wrap) {
      widest = Math.max(widest, measure(line));
      line = word;
    } else {
      line = next;
    }
  }
  return Math.max(widest, measure(line));
}

function twoLines(text: string, measure: MeasureText): string[] | null {
  const words = text.split(' ');
  let best: string[] | null = null;
  let bestWidth = Number.POSITIVE_INFINITY;
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const width = Math.max(...lines.map(measure));
    if (width < bestWidth) {
      best = lines;
      bestWidth = width;
    }
  }
  return best;
}

function bodyReach(b: LabelBox, w: number, nodeWidth: number): { lo: number; hi: number } {
  const mid = nodeWidth / 2;
  const chipLo = b.side === 'right' ? nodeWidth - b.chip : b.side === 'left' ? nodeWidth - b.chip / 2 : mid - b.chip / 2;
  const chipHi = b.side === 'right' ? nodeWidth : b.side === 'left' ? nodeWidth + b.chip / 2 : mid + b.chip / 2;
  let lo = Math.min(0, chipLo);
  let hi = Math.max(nodeWidth, chipHi);
  if (b.side === 'right') hi = Math.max(hi, nodeWidth + b.distance + (b.lead ?? 0) + w);
  if (b.side === 'left') lo = Math.min(lo, -b.distance - w);
  if (b.side === 'bottom') {
    lo = Math.min(lo, mid - w / 2);
    hi = Math.max(hi, mid + w / 2);
  }
  return { lo, hi };
}

interface ColumnNeeds {
  gaps: number[];
  right: number;
}

export function columnNeeds(
  nodes: FunnelNode[],
  links: FunnelLink[],
  box: (n: FunnelNode) => LabelBox,
  measure: MeasureText,
  nodeWidth: number,
): ColumnNeeds {
  const depth = new Map(nodes.map((n) => [n.name, nodeDepth(n.name, links)]));
  const columns = Math.max(0, ...depth.values()) + 1;
  const lo = new Array<number>(columns).fill(0);
  const hi = new Array<number>(columns).fill(nodeWidth);
  const header = new Array<number>(columns).fill(0);
  for (const n of nodes) {
    const d = depth.get(n.name) ?? 0;
    const b = box(n);
    const w = b.lines ? Math.max(...b.lines.map(measure)) : wrappedWidth(n.name, b.wrap, measure);
    if (b.side === 'top') header[d] = Math.max(header[d], w);
    const reach = bodyReach(b, w, nodeWidth);
    lo[d] = Math.min(lo[d], reach.lo);
    hi[d] = Math.max(hi[d], reach.hi);
  }
  const gaps: number[] = [];
  for (let d = 0; d < columns - 1; d++) {
    const body = hi[d] - lo[d + 1] - nodeWidth + LABEL_MARGIN;
    const head = header[d] > 0 ? header[d] - nodeWidth + HEADER_MARGIN : 0;
    gaps.push(Math.max(0, body, head));
  }
  const last = columns - 1;
  const right = Math.max(hi[last] - nodeWidth, header[last] - nodeWidth / 2) + LABEL_MARGIN;
  return { gaps, right };
}

export function columnLefts(needs: number[], plotWidth: number, nodeWidth: number): number[] | null {
  const free = plotWidth - (needs.length + 1) * nodeWidth;
  if (needs.reduce((s, n) => s + n, 0) > free) return null;
  const fixed = new Set<number>();
  let even = 0;
  for (;;) {
    const taken = [...fixed].reduce((s, i) => s + needs[i], 0);
    even = (free - taken) / (needs.length - fixed.size);
    const grow = needs.findIndex((n, i) => !fixed.has(i) && n > even);
    if (grow < 0) break;
    fixed.add(grow);
  }
  const lefts = [0];
  needs.forEach((n, i) => lefts.push(lefts[i] + nodeWidth + (fixed.has(i) ? n : even)));
  return lefts;
}

interface ColumnFit {
  fontSize: number;
  right: number;
  lefts: number[];
  lines: Map<string, string[]>;
}

export function fitColumns(
  nodes: FunnelNode[],
  links: FunnelLink[],
  box: (n: FunnelNode, measure: MeasureText, fontSize: number) => LabelBox,
  measureAt: (fontSize: number) => MeasureText,
  { width, left, nodeWidth, fontSizes }: { width: number; left: number; nodeWidth: number; fontSizes: number[] },
): ColumnFit | null {
  for (const fontSize of fontSizes) {
    const measure = measureAt(fontSize);
    const lines = new Map<string, string[]>();
    const boxed = (n: FunnelNode): LabelBox => {
      const split = lines.get(n.name);
      return split ? { ...box(n, measure, fontSize), lines: split } : box(n, measure, fontSize);
    };
    const total = (needs: ColumnNeeds) =>
      left + (needs.gaps.length + 1) * nodeWidth + needs.gaps.reduce((s, g) => s + g, 0) + needs.right;
    let needs = columnNeeds(nodes, links, boxed, measure, nodeWidth);
    while (total(needs) > width) {
      let best: { name: string; split: string[]; needs: ColumnNeeds } | null = null;
      for (const n of nodes) {
        const split = boxed(n).side === 'top' && !lines.has(n.name) ? twoLines(n.name, measure) : null;
        if (!split) continue;
        lines.set(n.name, split);
        const tried = columnNeeds(nodes, links, boxed, measure, nodeWidth);
        lines.delete(n.name);
        if (total(tried) < total(best?.needs ?? needs)) best = { name: n.name, split, needs: tried };
      }
      if (!best) break;
      lines.set(best.name, best.split);
      needs = best.needs;
    }
    const lefts = columnLefts(needs.gaps, width - left - needs.right, nodeWidth);
    if (lefts) return { fontSize, right: needs.right, lefts, lines };
  }
  return null;
}
