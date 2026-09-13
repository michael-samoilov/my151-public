/**
 * Turn a staged usage funnel into Sankey nodes and links.
 *
 * The trunk is a chain of "still in" nodes so each incomplete peel sits in
 * its own column: earlier drop-off is further left. Through-nodes and success
 * outcomes are listed before peels in the same column so a user who stays
 * on the path runs along the top ribbon, and every peel sits on the bottom.
 */
import type { DexUsageFunnel, FunnelPeel, LeagueUsageFunnel, ReferrerFlowEntry } from '../../api/_aggregate';

export type FunnelRole = 'success' | 'sink' | 'priv' | 'neutral';
export type FunnelLabelSide = 'left' | 'right' | 'top' | 'bottom';

export interface FunnelNode {
  name: string;
  role: FunnelRole;
  label: FunnelLabelSide;
}

export interface FunnelLink {
  source: string;
  target: string;
  value: number;
  role: FunnelRole;
}

export interface FunnelSankey {
  nodes: FunnelNode[];
  links: FunnelLink[];
  ariaLabel: string;
}

function addNode(nodes: FunnelNode[], seen: Set<string>, node: FunnelNode) {
  if (seen.has(node.name)) return;
  seen.add(node.name);
  nodes.push(node);
}

function addLink(links: FunnelLink[], link: FunnelLink) {
  if (link.value <= 0) return;
  links.push(link);
}

function stagedSankey(opts: {
  startName: string;
  builtName: string;
  bouncedName: string;
  opened: number;
  built: number;
  bounced: number;
  peels: FunnelPeel[];
  through: FunnelPeel[];
  outcomes: { name: string; count: number; role: FunnelRole }[];
  ariaLabel: string;
}): FunnelSankey {
  const nodes: FunnelNode[] = [];
  const links: FunnelLink[] = [];
  const seen = new Set<string>();

  addNode(nodes, seen, { name: opts.startName, role: 'neutral', label: 'left' });
  addNode(nodes, seen, { name: opts.builtName, role: 'neutral', label: 'top' });
  addLink(links, { source: opts.startName, target: opts.builtName, value: opts.built, role: 'neutral' });
  if (opts.bounced > 0) {
    addNode(nodes, seen, { name: opts.bouncedName, role: 'sink', label: 'bottom' });
    addLink(links, { source: opts.startName, target: opts.bouncedName, value: opts.bounced, role: 'sink' });
  }

  let src = opts.builtName;
  for (let i = 0; i < opts.through.length; i++) {
    const peel = opts.peels[i];
    const next = opts.through[i];
    if (!next) break;
    const isLast = i === opts.through.length - 1;
    const from = src;
    if (next.count > 0) {
      addNode(nodes, seen, {
        name: next.label,
        role: isLast ? 'success' : 'neutral',
        label: 'top',
      });
      addLink(links, {
        source: from,
        target: next.label,
        value: next.count,
        role: isLast ? 'success' : 'neutral',
      });
      src = next.label;
    }
    if (peel && peel.count > 0) {
      addNode(nodes, seen, { name: peel.label, role: 'sink', label: 'bottom' });
      addLink(links, { source: from, target: peel.label, value: peel.count, role: 'sink' });
    }
  }

  const presentOutcomes = opts.outcomes.filter((o) => o.count > 0);
  presentOutcomes.forEach((o, i) => {
    const label: FunnelLabelSide =
      presentOutcomes.length === 1 ? 'right' : i === 0 ? 'top' : i === presentOutcomes.length - 1 ? 'bottom' : 'right';
    addNode(nodes, seen, { name: o.name, role: o.role, label });
    addLink(links, { source: src, target: o.name, value: o.count, role: o.role });
  });

  return orderSankeyForLayout(nodes, links, opts.ariaLabel);
}

export function dexFunnelSankey(f: DexUsageFunnel): FunnelSankey {
  return stagedSankey({
    startName: 'Saw intro',
    builtName: 'Built',
    bouncedName: 'Bounced',
    opened: f.opened,
    built: f.built,
    bounced: f.bounced,
    peels: f.peels,
    through: f.through,
    outcomes: [
      { name: 'Exported', count: f.exported, role: 'success' },
      { name: 'Kept private', count: f.keptPrivate, role: 'priv' },
    ],
    ariaLabel: `Dex usage funnel: ${f.opened} saw intro, ${f.built} built, ${f.bounced} bounced; of ${f.built} built, ${f.completed} completed and ${f.peels.map((p) => `${p.count} stopped at ${p.label}`).join(', ')}; of ${f.completed} completed, ${f.exported} exported and ${f.keptPrivate} kept private.`,
  });
}

export function leagueFunnelSankey(f: LeagueUsageFunnel): FunnelSankey {
  return stagedSankey({
    startName: 'Opened',
    builtName: 'Seated',
    bouncedName: 'Left',
    opened: f.opened,
    built: f.seated,
    bounced: f.bounced,
    peels: f.peels,
    through: f.through,
    outcomes: [
      { name: 'Exported league', count: f.exportedLeague, role: 'success' },
      { name: 'Exported card', count: f.exportedCardOnly, role: 'success' },
      { name: 'Kept private', count: f.keptPrivate, role: 'priv' },
    ],
    ariaLabel: `League usage funnel: ${f.opened} opened, ${f.seated} seated, ${f.bounced} left; of ${f.seated} seated, ${f.fullLeague} filled a full league and ${f.peels.map((p) => `${p.count} stopped at ${p.label}`).join(', ')}; of ${f.fullLeague} full, ${f.exportedLeague} exported a league, ${f.exportedCardOnly} exported a card only, ${f.keptPrivate} kept private.`,
  });
}

/** Distance along the trunk from the start node. Used to assert earlier peels
 *  sit further left than later ones. */
export function nodeDepth(name: string, links: FunnelLink[]): number {
  const incoming = links.filter((l) => l.target === name);
  if (incoming.length === 0) return 0;
  return 1 + Math.max(...incoming.map((l) => nodeDepth(l.source, links)));
}

/** Vertical order inside a Sankey column. Through-nodes first (top ribbon),
 *  then success, then private, then peels. echarts with `layoutIterations: 0`
 *  stacks a column in node-list order. */
const ROLE_STACK: Record<FunnelRole, number> = {
  success: 0,
  neutral: 1,
  priv: 2,
  sink: 3,
};

export function orderSankeyForLayout(nodes: FunnelNode[], links: FunnelLink[], ariaLabel: string): FunnelSankey {
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const outgoing = new Set(links.map((l) => l.source));
  const rank = (name: string): number => {
    const n = byName.get(name);
    if (!n) return 99;
    if (outgoing.has(name) && n.role !== 'sink') return -1;
    return ROLE_STACK[n.role];
  };
  const orderedNodes = [...nodes].sort(
    (a, b) => nodeDepth(a.name, links) - nodeDepth(b.name, links) || rank(a.name) - rank(b.name),
  );
  const seen = new Set<string>();
  const orderedLinks: FunnelLink[] = [];
  for (const n of orderedNodes) {
    const from = links
      .filter((l) => l.source === n.name)
      .sort((a, b) => rank(a.target) - rank(b.target));
    for (const l of from) {
      const key = `${l.source}\0${l.target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      orderedLinks.push(l);
    }
  }
  return { nodes: orderedNodes, links: orderedLinks, ariaLabel };
}

export function referrerFlowSankey(rows: ReferrerFlowEntry[]): FunnelSankey {
  const nodes: FunnelNode[] = [
    ...rows.map((r) => ({ name: r.host, role: 'neutral' as const, label: 'left' as const })),
    { name: 'Dex', role: 'success', label: 'top' },
    { name: 'League', role: 'priv', label: 'bottom' },
  ];
  const links: FunnelLink[] = rows.flatMap((r) => [
    ...(r.dex > 0 ? [{ source: r.host, target: 'Dex', value: r.dex, role: 'success' as const }] : []),
    ...(r.league > 0 ? [{ source: r.host, target: 'League', value: r.league, role: 'priv' as const }] : []),
  ]);
  return orderSankeyForLayout(
    nodes,
    links,
    `Referrer to landing: ${rows.map((r) => r.host).join(', ')} split into dex and league landings.`,
  );
}
