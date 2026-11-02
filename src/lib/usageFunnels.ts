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
  percentage?: { value: number | null; basis: string };
}

export interface FunnelLink {
  source: string;
  target: string;
  value: number;
  role: FunnelRole;
}

interface FunnelSankey {
  nodes: FunnelNode[];
  links: FunnelLink[];
  ariaLabel: string;
}

function percentage(nodes: FunnelNode[], name: string, numerator: number, denominator: number, basis: string) {
  const node = nodes.find((n) => n.name === name);
  if (node) node.percentage = { value: denominator > 0 ? numerator / denominator * 100 : null, basis };
}

function percentageDescription(nodes: FunnelNode[]): string {
  return nodes.filter((n) => n.percentage).map((n) =>
    `${n.name}: ${n.percentage!.value === null ? 'unavailable' : `${Math.round(n.percentage!.value)}%`} of ${n.percentage!.basis}`,
  ).join('; ');
}

function convergeExports(nodes: FunnelNode[], links: FunnelLink[], names: string[]) {
  const branches = links.filter((l) => names.includes(l.target));
  if (!branches.length) return;
  const totals = names.map((name) => ({ name, value: branches.filter((l) => l.target === name).reduce((sum, l) => sum + l.value, 0) }));
  links.splice(0, links.length, ...links.filter((l) => !names.includes(l.target)));
  nodes.push({ name: 'Exported', role: 'success', label: 'right' });
  for (const branch of branches) addLink(links, { ...branch, target: 'Exported' });
  const exported = totals.reduce((sum, end) => sum + end.value, 0);
  for (const end of totals) {
    addLink(links, { source: 'Exported', target: end.name, value: end.value, role: 'success' });
    percentage(nodes, end.name, end.value, exported, 'exported browsers');
  }
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

  percentage(nodes, 'Bounced', f.bounced, f.opened, 'entrants');
  percentage(nodes, 'Completed', f.completed, f.built, 'non-bouncers');
  percentage(nodes, 'Exported', f.exported + f.buckets.reduce((sum, b) => sum + b.exported, 0), f.built, 'non-bouncers');
  const bucketBits = f.buckets.map((b) => `${b.count} at ${b.label}`).join(', ');
  const incompleteExported = f.buckets.reduce((s, b) => s + b.exported, 0);
  const extra =
    incompleteExported > 0 ? `; ${incompleteExported} incomplete builders also exported` : '';
  return orderSankeyForLayout(
    nodes,
    links,
    `Dex usage funnel: ${f.opened} saw intro, ${f.built} placed a Pokémon, ${f.bounced} bounced; of ${f.built} placed, ${f.completed} completed and ${bucketBits}; of ${f.completed} completed, ${f.exported} exported and ${f.keptPrivate} kept private${extra}. ${percentageDescription(nodes)}.`,
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
  addFan(nodes, links, seen, 'Placed a Pokémon', gymFan(f.gymBuckets));
  if (f.cardNotFinished > 0) {
    addNode(nodes, seen, { name: 'Card not finished', role: 'sink', label: 'bottom' });
    addLink(links, {
      source: 'Placed a Pokémon',
      target: 'Card not finished',
      value: f.cardNotFinished,
      role: 'sink',
    });
  }
  convergeExports(nodes, links, LEAGUE_EXPORT_ENDS.map((end) => LEAGUE_EXPORT_NODE[end].name));
  percentage(nodes, 'Bounced', f.bounced, f.opened, 'entrants');
  percentage(nodes, 'Full league', f.fullLeague, f.placed, 'non-bouncers');
  percentage(nodes, 'Exported', Object.values(f.exports).reduce((sum, count) => sum + count, 0), f.placed, 'non-bouncers');

  const gymBits = f.gymBuckets.map((b) => `${b.count} at ${b.label}`).join(', ');
  return orderSankeyForLayout(
    nodes,
    links,
    `League usage funnel: ${f.opened} opened, ${f.placed} placed a Pokémon, ${f.bounced} bounced; of ${f.placed} placed, ${f.cardNotFinished} did not finish a card; gyms: ${gymBits}; ${f.exports.league} league export, ${f.exports.card} gym export, ${f.exports.both} both exported; of ${f.fullLeague} full league, ${f.keptPrivate} kept private. ${percentageDescription(nodes)}.`,
  );
}

type FavoriteBucket = FavoriteUsageFunnel['buckets'][number];

const FAVORITE_EXPORT_NODE = [
  { key: 'full', name: 'Full grid' },
  { key: 'both', name: 'Both exported' },
  { key: 'simplified', name: 'Simplified' },
] as const;

function favoriteEnds(b: FavoriteBucket): FanEnd[] {
  return FAVORITE_EXPORT_NODE.map(({ key, name }) => ({ name, label: 'right', value: b.exports[key] }));
}

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
  if (notStarted) addFan(nodes, links, seen, 'Opened', [{ name: 'Bounced', value: bounced, role: 'sink', ends: favoriteEnds(notStarted) }]);

  convergeExports(nodes, links, FAVORITE_EXPORT_NODE.map((end) => end.name));
  percentage(nodes, 'Bounced', bounced, f.opened, 'entrants');
  percentage(nodes, 'Completed', placed.find((b) => b.label === 'Completed')?.count ?? 0, placedCount, 'non-bouncers');
  const placedExports = placed.reduce((sum, b) => sum + Object.values(b.exports).reduce((total, count) => total + count, 0), 0);
  percentage(nodes, 'Exported', placedExports, placedCount, 'non-bouncers (non-bouncer exporters only; total Exported also includes empty-grid exporters)');
  const completed = placed.find((b) => b.label === 'Completed');
  const progress = placed.filter((b) => b.count > 0 && b !== completed).map((b) => `${b.count} at ${b.label}`).join(', ');
  const count = (key: 'full' | 'simplified' | 'both') => f.buckets.reduce((sum, b) => sum + b.exports[key], 0);
  return orderSankeyForLayout(nodes, links,
    `Favorite Pokémon usage funnel: ${f.opened} opened, ${placedCount} placed a Pokémon, ${bounced} bounced; of ${placedCount} placed, by maximum filled cells of 257: ${completed?.count ?? 0} completed${progress ? `, ${progress}` : ''}; lifetime exports: ${count('full')} full grid only, ${count('simplified')} simplified only, ${count('both')} both exported; of ${completed?.count ?? 0} completed, ${completed?.notExported ?? 0} not exported. ${percentageDescription(nodes)}.`);
}

export function nodeDepth(name: string, links: FunnelLink[]): number {
  const incoming = links.filter((l) => l.target === name);
  if (incoming.length === 0) return 0;
  return 1 + Math.max(...incoming.map((l) => nodeDepth(l.source, links)));
}

// platform: ECharts with layoutIterations: 0 stacks a Sankey column in node-list order.
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

function orderSankeyForLayout(nodes: FunnelNode[], links: FunnelLink[], ariaLabel: string): FunnelSankey {
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
