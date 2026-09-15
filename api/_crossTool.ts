/**
 * Cross-tool conversion, arrival-era overlap, and "league ⊂ dex".
 *
 * `api/submissions.ts` used to treat every dex browser as the conversion
 * denominator. The gym leader maker launched later, so that ratio mixed
 * "did not convert" with "never had a chance." Everything here is derived
 * from a tool catalog: add a row when a tool ships, and the KPIs, eras, and
 * Venns follow. Nothing here touches Redis.
 *
 * Driven by `src/lib/crossTool.test.ts`.
 */

import { EVOLUTION_CHAIN_BY_ID } from './_chains.js';
import type { LeagueCardShape } from './_leagueRecord.js';

export interface ToolDef {
  id: string;
  label: string;
  /** Few characters, for KPI labels (`Dex`, `League`). */
  short: string;
  /** UTC ms. `0` means "before any user" (the first tool). */
  launchedAt: number;
}

/** First production day of the hub and gym leader maker. Same day as
 *  `docs/analytics-accuracy.md` §1b. */
export const LEAGUE_LAUNCH_TS = Date.UTC(2026, 8, 8);

export const TOOL_CATALOG: readonly ToolDef[] = [
  { id: 'dex', label: 'Dex builder', short: 'Dex', launchedAt: 0 },
  { id: 'league', label: 'Gym leader maker', short: 'League', launchedAt: LEAGUE_LAUNCH_TS },
];

export interface LabeledRate {
  key: string;
  label: string;
  hint: string;
  n: number;
  of: number;
  pct: number | null;
}

export interface EraOverlap {
  key: string;
  label: string;
  /** One-line caption for the tile (`Before 8 Sep`). `label` stays the full phrase. */
  shortLabel: string;
  since: number | null;
  until: number | null;
  browsers: number;
  /**
   * Exclusive region counts. Key is the sorted tool ids the browser used,
   * joined by `+` (`dex`, `league`, `dex+league`).
   */
  regions: Record<string, number>;
}

export interface CrossToolSnapshot {
  catalog: ToolDef[];
  kpis: LabeledRate[];
  eras: EraOverlap[];
}

export interface DexLike {
  cid: string;
  firstTs: number;
  lastTs: number;
  latestIds?: number[];
}

export interface LeagueLike {
  cid: string;
  firstTs: number;
  lastTs: number;
  latest?: { seats: number };
  latestCards?: LeagueCardShape[];
}

interface Browser {
  cid: string;
  firstByTool: Record<string, number>;
  lastByTool: Record<string, number>;
  latestIds: Set<number>;
}

function bareCid(cid: string): string {
  return cid.split('::')[0] ?? cid;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function utcDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function utcDayShort(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function shortEraLabel(since: number | null, until: number | null): string {
  if (since === null && until !== null) return `Before ${utcDayShort(until)}`;
  if (until === null && since !== null) return `After ${utcDayShort(since)}`;
  if (since !== null && until !== null) {
    return `${utcDayShort(since)} to ${utcDayShort(until)}`;
  }
  return '';
}

function rate(n: number, of: number): Pick<LabeledRate, 'n' | 'of' | 'pct'> {
  return { n, of, pct: of > 0 ? Math.round((n / of) * 100) : null };
}

function used(b: Browser, id: string): boolean {
  return b.firstByTool[id] !== undefined;
}

function firstSeen(b: Browser): number {
  return Math.min(...Object.values(b.firstByTool));
}

function lastOn(b: Browser, ids: string[]): number {
  let max = -Infinity;
  for (const id of ids) {
    const t = b.lastByTool[id];
    if (t !== undefined && t > max) max = t;
  }
  return max;
}

function regionKey(ids: string[]): string {
  return [...ids].sort().join('+');
}

/**
 * Eras that start at or after the second tool. Before that, only one tool
 * existed, so a cross-tool Venn is not a question. A later tool (favourites)
 * adds another visible cut: 8 Sep to launch, then after launch.
 */
export function multiToolEras<T extends { since: number | null }>(eras: readonly T[]): T[] {
  return eras.filter((e) => e.since !== null);
}

export function eraBounds(catalog: readonly ToolDef[]): Omit<EraOverlap, 'browsers' | 'regions'>[] {
  const sorted = [...catalog].sort((a, b) => a.launchedAt - b.launchedAt);
  const cuts = sorted.slice(1);
  if (cuts.length === 0) return [];
  const out: Omit<EraOverlap, 'browsers' | 'regions'>[] = [];
  for (let i = 0; i < cuts.length; i++) {
    const since = i === 0 ? null : cuts[i - 1].launchedAt;
    const until = cuts[i].launchedAt;
    out.push({
      key: `before-${cuts[i].id}`,
      label: since === null ? `Arrived before ${utcDay(until)}` : `Arrived ${utcDay(since)} to ${utcDay(until)}`,
      shortLabel: shortEraLabel(since, until),
      since,
      until,
    });
  }
  const last = cuts[cuts.length - 1];
  out.push({
    key: `since-${last.id}`,
    label: `Arrived after ${utcDay(last.launchedAt)}`,
    shortLabel: shortEraLabel(last.launchedAt, null),
    since: last.launchedAt,
    until: null,
  });
  return out;
}

function eraOf(
  ts: number,
  bounds: Omit<EraOverlap, 'browsers' | 'regions'>[],
): Omit<EraOverlap, 'browsers' | 'regions'> {
  for (const e of bounds) {
    if (e.since !== null && ts < e.since) continue;
    if (e.until !== null && ts >= e.until) continue;
    return e;
  }
  return bounds[bounds.length - 1];
}

function mergeBrowsers(dexRecords: DexLike[], leagueRecords: LeagueLike[]): Browser[] {
  const byCid = new Map<string, Browser>();
  const take = (cid: string): Browser => {
    const id = bareCid(cid);
    let b = byCid.get(id);
    if (!b) {
      b = { cid: id, firstByTool: {}, lastByTool: {}, latestIds: new Set() };
      byCid.set(id, b);
    }
    return b;
  };
  for (const r of dexRecords) {
    const b = take(r.cid);
    b.firstByTool.dex = Math.min(b.firstByTool.dex ?? Infinity, r.firstTs);
    b.lastByTool.dex = Math.max(b.lastByTool.dex ?? 0, r.lastTs);
    for (const id of r.latestIds ?? []) b.latestIds.add(id);
  }
  for (const r of leagueRecords) {
    const b = take(r.cid);
    b.firstByTool.league = Math.min(b.firstByTool.league ?? Infinity, r.firstTs);
    b.lastByTool.league = Math.max(b.lastByTool.league ?? 0, r.lastTs);
  }
  return [...byCid.values()];
}

function conversions(catalog: readonly ToolDef[], browsers: Browser[]): LabeledRate[] {
  const sorted = [...catalog].sort((a, b) => a.launchedAt - b.launchedAt);
  const kpis: LabeledRate[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const tool = sorted[i];
    const earlier = sorted.slice(0, i);
    const earlierIds = earlier.map((t) => t.id);
    const from = earlier.length === 1 ? earlier[0].short : 'earlier tools';
    let eligible = 0;
    let adopted = 0;
    for (const b of browsers) {
      if (!earlierIds.some((id) => used(b, id))) continue;
      const returned = lastOn(b, earlierIds) >= tool.launchedAt;
      const opened = used(b, tool.id);
      if (!returned && !opened) continue;
      eligible += 1;
      if (opened) adopted += 1;
    }
    const { n, of, pct } = rate(adopted, eligible);
    kpis.push({
      key: `${earlier[0].id}-to-${tool.id}`,
      label: `${from} → ${tool.short}`,
      hint: `of ${from.toLowerCase()} users active after ${utcDay(tool.launchedAt)}`,
      n,
      of,
      pct,
    });
  }
  return kpis;
}

function companions(catalog: readonly ToolDef[], browsers: Browser[]): LabeledRate[] {
  const sorted = [...catalog].sort((a, b) => a.launchedAt - b.launchedAt);
  const kpis: LabeledRate[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const tool = sorted[i];
    const earlier = sorted.slice(0, i);
    const earlierIds = earlier.map((t) => t.id);
    const users = browsers.filter((b) => used(b, tool.id));
    const withEarlier = users.filter((b) => earlierIds.some((id) => used(b, id)));
    const { n, of, pct } = rate(withEarlier.length, users.length);
    const older = earlier.length === 1 ? earlier[0].short : 'an older tool';
    kpis.push({
      key: `${tool.id}-has-earlier`,
      label: `${tool.short} has a ${older.toLowerCase()}`,
      hint: `of ${tool.short.toLowerCase()} browsers`,
      n,
      of,
      pct,
    });
  }
  return kpis;
}

/** Pokemon ids seated on the board. Line members, ace, partner, legendaries.
 *  Not TM ids (moves) and not power-up form indices. */
export function seatedPokemonIds(cards: LeagueCardShape[]): number[] {
  const ids = new Set<number>();
  for (const card of cards) {
    for (const line of card.l) {
      for (const id of line.b) ids.add(id);
    }
    if (card.aceId) ids.add(card.aceId);
    if (card.pa) ids.add(card.pa);
    if (card.lg) for (const [, id] of card.lg) ids.add(id);
  }
  return [...ids];
}

function family(id: number): number {
  return EVOLUTION_CHAIN_BY_ID[id] ?? -id;
}

/** True when every seated league Pokemon is in the same evolution family as
 *  a member of the user's current dex. */
export function leagueIsDexNative(dexIds: number[], leagueIds: number[]): boolean {
  if (leagueIds.length === 0) return false;
  const families = new Set(dexIds.map(family));
  return leagueIds.every((id) => families.has(family(id)));
}

function dexNativeKpi(browsers: Browser[], leagueByCid: Map<string, LeagueLike>): LabeledRate | null {
  let known = 0;
  let native = 0;
  let unknown = 0;
  for (const b of browsers) {
    if (!used(b, 'dex') || !used(b, 'league')) continue;
    const rec = leagueByCid.get(b.cid);
    const seats = rec?.latest?.seats ?? 0;
    const cards = rec?.latestCards;
    if (!cards) {
      if (seats > 0) unknown += 1;
      continue;
    }
    const ids = seatedPokemonIds(cards);
    if (ids.length === 0) continue;
    known += 1;
    if (leagueIsDexNative([...b.latestIds], ids)) native += 1;
  }
  if (known === 0 && unknown === 0) return null;
  const { n, of, pct } = rate(native, known);
  return {
    key: 'league-from-dex',
    label: 'Only dex Pokémon',
    hint:
      unknown > 0
        ? `${n} of ${of} known dual-tool leagues; ${unknown} missing a stored team`
        : 'of dual-tool leagues with a stored team',
    n,
    of,
    pct,
  };
}

function eraOverlaps(catalog: readonly ToolDef[], browsers: Browser[]): EraOverlap[] {
  const bounds = eraBounds(catalog);
  const ids = catalog.map((t) => t.id);
  return bounds.map((bound) => {
    const regions: Record<string, number> = {};
    let n = 0;
    for (const b of browsers) {
      const ts = firstSeen(b);
      if (eraOf(ts, bounds).key !== bound.key) continue;
      n += 1;
      const usedIds = ids.filter((id) => used(b, id));
      if (usedIds.length === 0) continue;
      const key = regionKey(usedIds);
      regions[key] = (regions[key] ?? 0) + 1;
    }
    return { ...bound, browsers: n, regions };
  });
}

export function buildCrossTool(
  dexRecords: DexLike[],
  leagueRecords: LeagueLike[],
  catalog: readonly ToolDef[] = TOOL_CATALOG,
): CrossToolSnapshot {
  const browsers = mergeBrowsers(dexRecords, leagueRecords);
  const leagueByCid = new Map(leagueRecords.map((r) => [bareCid(r.cid), r]));
  const kpis = [...conversions(catalog, browsers), ...companions(catalog, browsers)];
  const native = dexNativeKpi(browsers, leagueByCid);
  if (native) kpis.push(native);
  return {
    catalog: catalog.map((t) => ({ ...t })),
    kpis,
    eras: eraOverlaps(catalog, browsers),
  };
}
