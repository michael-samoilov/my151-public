import { nodeDepth, type FunnelLabelSide, type FunnelLink, type FunnelNode } from './usageFunnels';

/** Peers in a column this tall include a middle bar. A name above or
 *  below that bar sits in nodeGap and lands on the next bar. */
const STACKED_COLUMN = 3;

function columnPeers(name: string, nodes: FunnelNode[], links: FunnelLink[]): FunnelNode[] {
  const depth = nodeDepth(name, links);
  return nodes.filter((n) => nodeDepth(n.name, links) === depth);
}

/**
 * Phone funnel label side.
 *
 * A label may use `top` only when no peer sits above it, and `bottom`
 * only when no peer sits below it. Those sides occupy nodeGap, which is
 * shorter than a line of type. A stacked column (three or more peers)
 * therefore puts every non-header name on the free horizontal side so
 * siblings share one alignment. Incoming flow occupies the left, so that
 * side is the right of the bar. Isolated drop-offs (Bounced, Card not
 * finished) still use the chart's bottom pad. First-stage names stay on
 * top of the bar.
 */
export function compactFunnelLabelSide(
  n: FunnelNode,
  nodes: FunnelNode[],
  links: FunnelLink[],
): FunnelLabelSide {
  const sources = new Set(links.map((l) => l.source));
  const targets = new Set(links.map((l) => l.target));
  const isSource = !targets.has(n.name);
  const isLeaf = !sources.has(n.name);
  const peers = columnPeers(n.name, nodes, links);
  const index = peers.findIndex((p) => p.name === n.name);
  const hasPeerAbove = index > 0;
  const hasPeerBelow = index >= 0 && index < peers.length - 1;
  const stacked = peers.length >= STACKED_COLUMN;

  if (isSource) return 'top';
  if (stacked && n.role === 'success' && !hasPeerAbove) return 'top';
  if (stacked || (hasPeerAbove && hasPeerBelow)) return 'right';
  if (isLeaf && n.role === 'sink' && !hasPeerBelow) return 'bottom';
  if (isLeaf) return 'right';
  if (n.role === 'success' && !hasPeerAbove) return 'top';
  if (n.label === 'bottom' && hasPeerBelow) return 'right';
  if (n.label === 'top' && hasPeerAbove) return 'right';
  return n.label === 'left' ? 'top' : n.label;
}
