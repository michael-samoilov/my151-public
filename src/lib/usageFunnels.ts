/**
 * Turn a staged usage funnel into Sankey nodes and links.
 *
 * Size / gym buckets fan out of one parent so they sit in one column,
 * not a staircase. Through and success sit at the top of a column;
 * drop-offs sit under them. Incomplete buckets that exported grow a
 * branch into the existing export node. They do not grow a "not
 * exported" peel. Full league peels non-exporters to Kept private,
 * same as Completed on the dex funnel and Not exported on the Picker.
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

/** One export end a fan item flows into. Every item lists the same ends
 *  in the same order, so the end column keeps that order. */
interface FanEnd {
  name: string;
  label: FunnelLabelSide;
  value: number;
}

interface FanItem {
  name: string;
  value: number;
  role: FunnelRole;
  exported?: number;
  exportName?: string;
  leftoverName?: string;
  leftoverRole?: FunnelRole;
  ends?: FanEnd[];
}

const LEAGUE_EXPORT_NODE: Record<LeagueExportEnd, { name: string; label: FunnelLabelSide }> = {
  league: { name: 'League export', label: 'top' },
  both: { name: 'Both exported', label: 'right' },
  card: { name: 'Gym export', label: 'right' },
};

function leagueEnds(exports: LeagueExportCounts): FanEnd[] {
  return LEAGUE_EXPORT_ENDS.map((end) => ({ ...LEAGUE_EXPORT_NODE[end], value: exports[end] }));
}

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
      const endExports = (item.ends ?? []).reduce((sum, end) => sum + end.value, 0);
      const left = item.value - (item.exported ?? 0) - endExports;
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
  const endOrder = [...new Set(present.flatMap((item) => (item.ends ?? []).map((end) => end.name)))];
  for (const name of endOrder) {
    for (const item of present) {
      const end = item.ends?.find((e) => e.name === name);
      if (!end || end.value <= 0) continue;
      addNode(nodes, seen, { name, role: 'success', label: end.label });
      addLink(links, { source: item.name, target: name, value: end.value, role: 'success' });
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
    ends: leagueEnds(b.exports),
    leftoverName: b.label === 'Full league' ? 'Kept private' : undefined,
    leftoverRole: 'priv',
  }));
}

export function dexFunnelSankey(f: DexUsageFunnel): FunnelSankey {
  const nodes: FunnelNode[] = [];
  const links: FunnelLink[] = [];
  const seen = new Set<string>();

  addNode(nodes, seen, { name: 'Saw intro', role: 'neutral', label: 'left' });
  addNode(nodes, seen, { name: 'Placed a Pokémon', role: 'neutral', label: 'top' });
  addLink(links, { source: 'Saw intro', target: 'Placed a Pokémon', value: f.built, role: 'neutral' });
  if (f.bounced > 0) {
    addNode(nodes, seen, { name: 'Bounced', role: 'sink', label: 'bottom' });
    addLink(links, { source: 'Saw intro', target: 'Bounced', value: f.bounced, role: 'sink' });
  }
  addFan(nodes, links, seen, 'Placed a Pokémon', sizeFan(f.completed, f.exported, f.keptPrivate, f.buckets));

  const bucketBits = f.buckets.map((b) => `${b.count} at ${b.label}`).join(', ');
  const incompleteExported = f.buckets.reduce((s, b) => s + b.exported, 0);
  const extra =
    incompleteExported > 0 ? `; ${incompleteExported} incomplete builders also exported` : '';
  return orderSankeyForLayout(
    nodes,
    links,
    `Dex usage funnel: ${f.opened} saw intro, ${f.built} placed a Pokémon, ${f.bounced} bounced; of ${f.built} placed, ${f.completed} completed and ${bucketBits}; of ${f.completed} completed, ${f.exported} exported and ${f.keptPrivate} kept private${extra}.`,
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

type FavoriteBucket = FavoriteUsageFunnel['buckets'][number];

/** Picker export ends, in column order under Not exported. */
const FAVORITE_EXPORT_NODE = [
  { key: 'full', name: 'Full grid' },
  { key: 'simplified', name: 'Simplified' },
  { key: 'both', name: 'Both exported' },
] as const;

function favoriteEnds(b: FavoriteBucket): FanEnd[] {
  return FAVORITE_EXPORT_NODE.map(({ key, name }) => ({ name, label: 'right', value: b.exports[key] }));
}

/** One browser follows one maximum-progress bucket and one export outcome.
 *  Export outcomes describe the record lifetime, not events in the range.
 *  Same shape as the dex funnel: Bounced ends at the first hop, cell
 *  buckets end beside Completed unless they exported, and Completed peels
 *  its non-exporters straight across into Not exported. */
export function favoriteFunnelSankey(f: FavoriteUsageFunnel): FunnelSankey {
  const nodes: FunnelNode[] = [];
  const links: FunnelLink[] = [];
  const seen = new Set<string>();
  const notStarted = f.buckets.find((b) => b.label === 'Not started');
  const placed = f.buckets.filter((b) => b !== notStarted);
  const placedCount = placed.reduce((sum, b) => sum + b.count, 0);
  const bounced = notStarted?.count ?? 0;

  addNode(nodes, seen, { name: 'Opened', role: 'neutral', label: 'left' });
  if (placedCount > 0) {
    addNode(nodes, seen, { name: 'Placed a Pokémon', role: 'neutral', label: 'top' });
    addLink(links, { source: 'Opened', target: 'Placed a Pokémon', value: placedCount, role: 'neutral' });
  }
  if (bounced > 0) addNode(nodes, seen, { name: 'Bounced', role: 'sink', label: 'bottom' });
  addFan(nodes, links, seen, 'Placed a Pokémon', [...placed].reverse().map((b): FanItem => {
    const completed = b.label === 'Completed';
    return {
      name: b.label,
      value: b.count,
      role: completed ? 'success' : 'sink',
      ends: favoriteEnds(b),
      leftoverName: completed ? 'Not exported' : undefined,
      leftoverRole: 'priv',
    };
  }));
  // An empty-grid export is possible, so Bounced keeps a branch to its end.
  if (notStarted) addFan(nodes, links, seen, 'Opened', [{ name: 'Bounced', value: bounced, role: 'sink', ends: favoriteEnds(notStarted) }]);

  const completed = placed.find((b) => b.label === 'Completed');
  const progress = placed.filter((b) => b.count > 0 && b !== completed).map((b) => `${b.count} at ${b.label}`).join(', ');
  const count = (key: 'full' | 'simplified' | 'both') => f.buckets.reduce((sum, b) => sum + b.exports[key], 0);
  return orderSankeyForLayout(nodes, links,
    `Favorite Pokémon usage funnel: ${f.opened} opened, ${placedCount} placed a Pokémon, ${bounced} bounced; of ${placedCount} placed, by maximum filled cells of 257: ${completed?.count ?? 0} completed${progress ? `, ${progress}` : ''}; lifetime exports: ${count('full')} full grid only, ${count('simplified')} simplified only, ${count('both')} both exported; of ${completed?.count ?? 0} completed, ${completed?.notExported ?? 0} not exported.`);
}

/** Distance along the trunk from the start node. Used to assert buckets
 *  that share a parent sit in the same column. */
export function nodeDepth(name: string, links: FunnelLink[]): number {
  const incoming = links.filter((l) => l.target === name);
  if (incoming.length === 0) return 0;
  return 1 + Math.max(...incoming.map((l) => nodeDepth(l.source, links)));
}

/** Vertical order inside a Sankey column. Kept private (Not exported on
 *  the Picker) sits above
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
  if (name === 'Kept private' || name === 'Not exported') return -1;
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
    ...(rows.some(r => (r.favorites ?? 0) > 0) ? [{ name: 'Favorites', role: 'neutral' as const, label: 'right' as const }] : []),
  ];
  const links: FunnelLink[] = rows.flatMap((r) => [
    ...(r.dex > 0 ? [{ source: r.host, target: 'Dex', value: r.dex, role: 'success' as const }] : []),
    ...(r.league > 0 ? [{ source: r.host, target: 'League', value: r.league, role: 'priv' as const }] : []),
    ...((r.favorites ?? 0) > 0 ? [{ source: r.host, target: 'Favorites', value: r.favorites ?? 0, role: 'neutral' as const }] : []),
  ]);
  return orderSankeyForLayout(
    nodes,
    links,
    `Referrer to landing: ${rows.map((r) => r.host).join(', ')} ${rows.some(r => r.favorites !== undefined) ? 'reached dex, league and favorites; browser reach can overlap across tools' : 'split into dex and league landings'}.`,
  );
}
