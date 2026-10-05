/**
 * Turn a staged usage funnel into Sankey nodes and links.
 *
 * Size / gym buckets fan out of one parent so they sit in one column,
 * not a staircase. Through and success sit at the top of a column;
 * drop-offs sit under them. Incomplete buckets that exported grow a
 * branch into the existing export node. They do not grow a "not
 * exported" peel. Full league peels non-exporters to Kept private,
 * same as Completed on the dex funnel.
 */
import {
  LEAGUE_EXPORT_ENDS,
  type DexSizeBucket,
  type DexUsageFunnel,
  type LeagueExportCounts,
  type LeagueExportEnd,
  type LeagueGymBucket,
  type LeagueUsageFunnel,
  type ReferrerFlowEntry,
} from '../../api/_aggregate';

import type { FavoriteUsageFunnel } from '../../api/_favoriteAggregate';

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
  const existing = links.find((l) => l.source === link.source && l.target === link.target);
  if (existing) {
    existing.value += link.value;
    return;
  }
  links.push(link);
}

interface FanItem {
  name: string;
  value: number;
  role: FunnelRole;
  exported?: number;
  exportName?: string;
  leftoverName?: string;
  leftoverRole?: FunnelRole;
  exports?: LeagueExportCounts;
}

const LEAGUE_EXPORT_NODE: Record<LeagueExportEnd, { name: string; label: FunnelLabelSide }> = {
  league: { name: 'League export', label: 'top' },
  both: { name: 'Both exported', label: 'right' },
  card: { name: 'Gym export', label: 'right' },
};

function addFan(
  nodes: FunnelNode[],
  links: FunnelLink[],
  seen: Set<string>,
  from: string,
  items: FanItem[],
) {
  const present = items.filter((i) => i.value > 0);
  for (const item of present) {
    addNode(nodes, seen, {
      name: item.name,
      role: item.role,
      label: item.role === 'success' ? 'top' : 'right',
    });
    addLink(links, { source: from, target: item.name, value: item.value, role: item.role });
  }

  for (const item of present) {
    if ((item.exported ?? 0) > 0 && item.exportName) {
      addNode(nodes, seen, { name: item.exportName, role: 'success', label: 'top' });
      addLink(links, {
        source: item.name,
        target: item.exportName,
        value: item.exported ?? 0,
        role: 'success',
      });
    }
    if (item.leftoverName) {
      const leagueExports = LEAGUE_EXPORT_ENDS.reduce((sum, end) => sum + (item.exports?.[end] ?? 0), 0);
      const left = item.value - (item.exported ?? 0) - leagueExports;
      if (left > 0) {
        addNode(nodes, seen, {
          name: item.leftoverName,
          role: item.leftoverRole ?? 'priv',
          label: 'top',
        });
        addLink(links, {
          source: item.name,
          target: item.leftoverName,
          value: left,
          role: item.leftoverRole ?? 'priv',
        });
      }
    }
  }
  for (const end of LEAGUE_EXPORT_ENDS) {
    const { name, label } = LEAGUE_EXPORT_NODE[end];
    for (const item of present) {
      const value = item.exports?.[end] ?? 0;
      if (value <= 0) continue;
      addNode(nodes, seen, { name, role: 'success', label });
      addLink(links, { source: item.name, target: name, value, role: 'success' });
    }
  }
}

function sizeFan(completed: number, exported: number, keptPrivate: number, buckets: DexSizeBucket[]): FanItem[] {
  const items: FanItem[] = [];
  if (completed > 0) {
    items.push({
      name: 'Completed',
      value: completed,
      role: 'success',
      exported,
      exportName: 'Exported',
      leftoverName: keptPrivate > 0 ? 'Kept private' : undefined,
      leftoverRole: 'priv',
    });
  }
  // High sizes first so they stack under Completed, early drop-offs at the
  // bottom of the same column.
  for (const b of [...buckets].reverse()) {
    items.push({
      name: b.label,
      value: b.count,
      role: 'sink',
      exported: b.exported,
      exportName: 'Exported',
    });
  }
  return items;
}

function gymFan(buckets: LeagueGymBucket[]): FanItem[] {
  return [...buckets].reverse().map((b) => ({
    name: b.label,
    value: b.count,
    role: b.label === 'Full league' ? 'success' : 'sink',
    exports: b.exports,
    leftoverName: b.label === 'Full league' ? 'Kept private' : undefined,
    leftoverRole: 'priv',
  }));
}

export function dexFunnelSankey(f: DexUsageFunnel): FunnelSankey {
  const nodes: FunnelNode[] = [];
  const links: FunnelLink[] = [];
  const seen = new Set<string>();

  addNode(nodes, seen, { name: 'Saw intro', role: 'neutral', label: 'left' });
  addNode(nodes, seen, { name: 'Built', role: 'neutral', label: 'top' });
  addLink(links, { source: 'Saw intro', target: 'Built', value: f.built, role: 'neutral' });
  if (f.bounced > 0) {
    addNode(nodes, seen, { name: 'Bounced', role: 'sink', label: 'bottom' });
    addLink(links, { source: 'Saw intro', target: 'Bounced', value: f.bounced, role: 'sink' });
  }
  addFan(nodes, links, seen, 'Built', sizeFan(f.completed, f.exported, f.keptPrivate, f.buckets));

  const bucketBits = f.buckets.map((b) => `${b.count} at ${b.label}`).join(', ');
  const incompleteExported = f.buckets.reduce((s, b) => s + b.exported, 0);
  const extra =
    incompleteExported > 0 ? `; ${incompleteExported} incomplete builders also exported` : '';
  return orderSankeyForLayout(
    nodes,
    links,
    `Dex usage funnel: ${f.opened} saw intro, ${f.built} built, ${f.bounced} bounced; of ${f.built} built, ${f.completed} completed and ${bucketBits}; of ${f.completed} completed, ${f.exported} exported and ${f.keptPrivate} kept private${extra}.`,
  );
}

export function leagueFunnelSankey(f: LeagueUsageFunnel): FunnelSankey {
  const nodes: FunnelNode[] = [];
  const links: FunnelLink[] = [];
  const seen = new Set<string>();

  addNode(nodes, seen, { name: 'Opened', role: 'neutral', label: 'left' });
  if (f.placed > 0) {
    addNode(nodes, seen, { name: 'Placed a Pokémon', role: 'neutral', label: 'top' });
    addLink(links, { source: 'Opened', target: 'Placed a Pokémon', value: f.placed, role: 'neutral' });
  }
  if (f.bounced > 0) {
    addNode(nodes, seen, { name: 'Bounced', role: 'sink', label: 'bottom' });
    addLink(links, { source: 'Opened', target: 'Bounced', value: f.bounced, role: 'sink' });
  }
  if (f.oneGymFull > 0) {
    addNode(nodes, seen, { name: 'One gym full', role: 'neutral', label: 'top' });
    addLink(links, {
      source: 'Placed a Pokémon',
      target: 'One gym full',
      value: f.oneGymFull,
      role: 'neutral',
    });
  }
  if (f.cardNotFinished > 0) {
    addNode(nodes, seen, { name: 'Card not finished', role: 'sink', label: 'bottom' });
    addLink(links, {
      source: 'Placed a Pokémon',
      target: 'Card not finished',
      value: f.cardNotFinished,
      role: 'sink',
    });
  }
  if (f.oneGymFull > 0) {
    addFan(nodes, links, seen, 'One gym full', gymFan(f.gymBuckets));
  }

  const gymBits = f.gymBuckets.map((b) => `${b.count} at ${b.label}`).join(', ');
  return orderSankeyForLayout(
    nodes,
    links,
    `League usage funnel: ${f.opened} opened, ${f.placed} placed a Pokémon, ${f.bounced} bounced; of ${f.placed} placed, ${f.oneGymFull} filled a gym and ${f.cardNotFinished} did not finish a card; gyms: ${gymBits}; ${f.exports.league} league export, ${f.exports.card} gym export, ${f.exports.both} both exported; of ${f.fullLeague} full league, ${f.keptPrivate} kept private.`,
  );
}

/** One browser follows one maximum-progress bucket and one export outcome.
 *  Export outcomes describe the record lifetime, not events in the range. */
export function favoriteFunnelSankey(f: FavoriteUsageFunnel): FunnelSankey {
  const nodes: FunnelNode[] = [{ name: 'Opened', role: 'neutral', label: 'left' }];
  const links: FunnelLink[] = [];
  const seen = new Set(['Opened']);
  const outcomes = [
    { key: 'full', name: 'Full grid', role: 'success' },
    { key: 'both', name: 'Both views', role: 'success' },
    { key: 'simplified', name: 'Simplified', role: 'success' },
    { key: 'notExported', name: 'Not exported', role: 'priv' },
  ] as const;
  for (const bucket of [...f.buckets].reverse()) {
    if (bucket.count <= 0) continue;
    const role = bucket.label === 'Completed' ? 'success' : 'neutral';
    addNode(nodes, seen, { name: bucket.label, role, label: 'right' });
    addLink(links, { source: 'Opened', target: bucket.label, value: bucket.count, role });
    for (const outcome of outcomes) {
      const value = outcome.key === 'notExported' ? bucket.notExported : bucket.exports[outcome.key];
      if (value <= 0) continue;
      addNode(nodes, seen, { name: outcome.name, role: outcome.role, label: 'right' });
      addLink(links, { source: bucket.label, target: outcome.name, value, role: outcome.role });
    }
  }
  const progress = f.buckets.filter(b => b.count > 0).map(b => `${b.count} at ${b.label}`).join(', ');
  const count = (key: 'full' | 'simplified' | 'both' | 'notExported') => f.buckets.reduce((sum, b) => sum + (key === 'notExported' ? b.notExported : b.exports[key]), 0);
  return orderSankeyForLayout(nodes, links,
    `Favorite Pokémon usage funnel: ${f.opened} opened; maximum filled cells (picks and pointers, 257 total): ${progress || 'none'}; lifetime exports: ${count('full')} full grid only, ${count('simplified')} simplified only, ${count('both')} both views, ${count('notExported')} not exported.`);
}

/** Distance along the trunk from the start node. Used to assert buckets
 *  that share a parent sit in the same column. */
export function nodeDepth(name: string, links: FunnelLink[]): number {
  const incoming = links.filter((l) => l.target === name);
  if (incoming.length === 0) return 0;
  return 1 + Math.max(...incoming.map((l) => nodeDepth(l.source, links)));
}

/** Vertical order inside a Sankey column. Kept private sits above
 *  success so its last-hop ribbon stays on top and does not cross the
 *  bucket stack. Then success, through, other private, drop-offs.
 *  Outgoing export links do not promote a size bucket into the through
 *  rank, or exporting 1–30 would sit next to Completed. echarts with
 *  `layoutIterations: 0` stacks a column in node-list order. */
const ROLE_STACK: Record<FunnelRole, number> = {
  success: 0,
  neutral: 1,
  priv: 2,
  sink: 3,
};

function stackRank(name: string, role: FunnelRole | undefined): number {
  if (name === 'Kept private') return -1;
  if (!role) return 99;
  return ROLE_STACK[role];
}

export function orderSankeyForLayout(nodes: FunnelNode[], links: FunnelLink[], ariaLabel: string): FunnelSankey {
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const rank = (name: string): number => stackRank(name, byName.get(name)?.role);
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
    ...(rows.some(r => r.favorites !== undefined) ? [{ name: 'Favorites', role: 'neutral' as const, label: 'right' as const }] : []),
  ];
  const links: FunnelLink[] = rows.flatMap((r) => [
    ...(r.dex > 0 ? [{ source: r.host, target: 'Dex', value: r.dex, role: 'success' as const }] : []),
    ...(r.league > 0 ? [{ source: r.host, target: 'League', value: r.league, role: 'priv' as const }] : []),
    ...((r.favorites ?? 0) > 0 ? [{ source: r.host, target: 'Favorites', value: r.favorites ?? 0, role: 'neutral' as const }] : []),
  ]);
  return orderSankeyForLayout(
    nodes,
    links,
    `Referrer to landing: ${rows.map((r) => r.host).join(', ')} split into dex and league${rows.some(r => r.favorites !== undefined) ? ' and favorites' : ''} landings.`,
  );
}
