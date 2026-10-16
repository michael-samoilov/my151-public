import { nodeDepth, type FunnelLabelSide, type FunnelLink, type FunnelNode } from './usageFunnels';

const STACKED_COLUMN = 3;

function columnPeers(name: string, nodes: FunnelNode[], links: FunnelLink[]): FunnelNode[] {
  const depth = nodeDepth(name, links);
  return nodes.filter((n) => nodeDepth(n.name, links) === depth);
}

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
