import { nodeDepth, type FunnelLabelSide, type FunnelLink, type FunnelNode } from './usageFunnels';

/** Where a node's name sits, the width echarts wraps it at, its gap from
 *  the bar, and the width of the count chip centered on its bar. */
export interface LabelBox {
  side: FunnelLabelSide;
  wrap: number;
  distance: number;
  chip: number;
}

export type MeasureText = (text: string) => number;

/** Clear space kept between a label and the next thing it could touch. */
const LABEL_MARGIN = 3;
/** Clear space between two column headers, wide enough that "Pokémon" and
 *  "full" read as two headers, not one phrase. */
const HEADER_MARGIN = 6;

/** Width of the widest line once echarts' `overflow: 'break'` wraps the
 *  text at word gaps. A word wider than `wrap` keeps its own line. */
export function wrappedWidth(text: string, wrap: number, measure: MeasureText): number {
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

/**
 * The gap each column's labels need before the next column's bars, in px.
 * A right label runs across the gap. A top label starts at its bar and runs
 * right toward the next header. A bottom label is centered on its bar, so
 * it reaches half its width toward each neighbor's bar and count chip.
 */
export function gapNeeds(
  nodes: FunnelNode[],
  links: FunnelLink[],
  box: (n: FunnelNode) => LabelBox,
  measure: MeasureText,
  nodeWidth: number,
): number[] {
  const depth = new Map(nodes.map((n) => [n.name, nodeDepth(n.name, links)]));
  const columns = Math.max(0, ...depth.values()) + 1;
  const needs = new Array<number>(Math.max(0, columns - 1)).fill(0);
  const bottomHalf = new Array<number>(columns).fill(0);
  const chipHalf = new Array<number>(columns).fill(nodeWidth / 2);
  for (const n of nodes) {
    const d = depth.get(n.name) ?? 0;
    chipHalf[d] = Math.max(chipHalf[d], box(n).chip / 2);
  }
  for (const n of nodes) {
    const d = depth.get(n.name) ?? 0;
    const b = box(n);
    const w = wrappedWidth(n.name, b.wrap, measure);
    if (b.side === 'right' && d < columns - 1) needs[d] = Math.max(needs[d], b.distance + w + LABEL_MARGIN);
    if (b.side === 'left' && d > 0) needs[d - 1] = Math.max(needs[d - 1], b.distance + w + LABEL_MARGIN);
    if (b.side === 'top' && d < columns - 1) needs[d] = Math.max(needs[d], w - nodeWidth + HEADER_MARGIN);
    if (b.side === 'bottom') {
      bottomHalf[d] = Math.max(bottomHalf[d], w / 2);
      if (d > 0) needs[d - 1] = Math.max(needs[d - 1], w / 2 + chipHalf[d - 1] - nodeWidth + LABEL_MARGIN);
      if (d < columns - 1) needs[d] = Math.max(needs[d], w / 2 + chipHalf[d + 1] - nodeWidth + LABEL_MARGIN);
    }
  }
  for (let d = 0; d < columns - 1; d++) {
    if (bottomHalf[d] > 0 && bottomHalf[d + 1] > 0) {
      needs[d] = Math.max(needs[d], bottomHalf[d] + bottomHalf[d + 1] - nodeWidth + LABEL_MARGIN);
    }
  }
  return needs;
}

/**
 * Left edge of each column's bars, in px from the plot's left edge.
 *
 * Columns sit evenly apart, as echarts places them, unless a gap is
 * narrower than its labels need. That gap then takes what it needs and the
 * other gaps share the rest evenly. Null when the plot cannot give every
 * gap what it needs.
 */
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
