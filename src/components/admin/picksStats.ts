import { ARCHETYPES } from '@/data/archetypes';
import { getCategoryById } from '@/data/categories';
import { BUILD_GROUPS } from '@/data/slot-template';
import {
  getAllPokemon,
  getEvolutionChainIds,
  getEvolutionLine,
  getPokemonById,
} from '@/hooks/usePokemonData';
import { TYPE_NAMES, type Pokemon, type TypeName } from '@/types/pokemon';
import type { LeaguePickRows, LeaguePicks } from '../../../api/_leaguePicks';
import { getPokemonById as getLeaguePokemonById } from '@/league/data/catalog';

export const PICKS_COLS = 6;
const PICKS_MOST_COLS = PICKS_COLS;
const PICKS_LEAST_DESKTOP_COLS = 3;
export const PICKS_COMBINED_COLS = PICKS_MOST_COLS + PICKS_LEAST_DESKTOP_COLS;
export const PICKS_PAIR_COLS = 12;
const PICKS_OFF_COLS = PICKS_COMBINED_COLS;

type GridCap = { maxRows: number; cols: number } | { maxLines: number };

export function picksGridCols(wide: boolean): number {
  return wide ? PICKS_OFF_COLS : PICKS_COLS;
}

function starterGenerationCount(): number {
  const cat = getCategoryById('starter');
  const groups = cat?.subgroups ?? [];
  let n = 0;
  for (const sg of groups) {
    if (/^Generation \d+$/.test(sg.label)) n += 1;
  }
  return n > 0 ? n : 1;
}

export function picksStarterCols(): number {
  return starterGenerationCount();
}

type PicksSplitCap =
  | { kind: 'single'; cap: GridCap }
  | { kind: 'dual'; most: GridCap; least: GridCap };

export function picksSplitCap(): PicksSplitCap {
  return {
    kind: 'single',
    cap: { maxRows: Number.POSITIVE_INFINITY, cols: picksGridCols(true) },
  };
}
export const STARTER_TYPES = ['grass', 'fire', 'water'] as const;

export type StarterType = (typeof STARTER_TYPES)[number] | 'other';

export interface LineMember {
  id: number;
  name: string;
  sprite: string;
  picks: number;
  index: number;
}

export interface RankedLine {
  key: string;
  members: LineMember[];
  picks: number;
  index: number;
  starterType: StarterType;
}

export interface DualColumn {
  most: RankedLine[];
  least: RankedLine[];
}

export interface StarterGroup extends DualColumn {
  type: StarterType;
}

export type SectionPicksView =
  | { kind: 'plain'; sectionId: string; columns: DualColumn }
  | { kind: 'starter'; sectionId: string; groups: StarterGroup[] };

const EVIL_TEAM = 'evil-team';

const DEFAULT_SECTIONS_OF = (() => {
  const map = new Map<number, Set<string>>();
  const archIds = new Map<string, Set<number>>();
  for (const a of ARCHETYPES) archIds.set(a.id, new Set(a.pokemonIds));
  for (const p of getAllPokemon()) {
    const set = new Set<string>();
    for (const g of BUILD_GROUPS) {
      if (g.filterType === 'archetype' && g.filterId && archIds.get(g.filterId)?.has(p.id)) set.add(g.id);
      else if (g.filterType === 'category' && g.filterId && getCategoryById(g.filterId)?.filter(p)) set.add(g.id);
      else if (g.filterType === null) set.add(g.id);
    }
    map.set(p.id, set);
  }
  const listed = archIds.get(EVIL_TEAM);
  if (listed) {
    for (const id of listed) {
      for (const rel of getEvolutionChainIds(id)) {
        const set = map.get(rel) ?? new Set<string>();
        set.add(EVIL_TEAM);
        map.set(rel, set);
      }
    }
  }
  return map;
})();

const POOL_BY_SECTION = (() => {
  const out = new Map<string, number[]>();
  for (const g of BUILD_GROUPS) out.set(g.id, []);
  for (const [id, sections] of DEFAULT_SECTIONS_OF) {
    for (const sid of sections) {
      if (sid === 'other') continue;
      out.get(sid)?.push(id);
    }
  }
  return out;
})();

export function isOffSection(id: number, sectionId: string): boolean {
  if (sectionId === 'other') return false;
  return !(DEFAULT_SECTIONS_OF.get(id)?.has(sectionId) ?? false);
}

export function poolIdsForSection(sectionId: string): readonly number[] {
  return POOL_BY_SECTION.get(sectionId) ?? [];
}

export function lineKey(id: number): string {
  const line = getEvolutionLine(id);
  if (line.length === 0) return String(id);
  return line.map((p) => p.id).join('-');
}

export function starterTypeOf(id: number): StarterType {
  const line = getEvolutionLine(id);
  const base = line[0] ?? getPokemonById(id);
  if (!base?.types?.length) return 'other';
  for (const t of base.types) {
    if (t === 'grass' || t === 'fire' || t === 'water') return t;
  }
  return 'other';
}

function roundedIndex(index: number): number {
  if (!Number.isFinite(index) || index <= 0) return 0;
  if (index >= 10) return Math.round(index);
  return Math.round(index * 10) / 10;
}

export function formatIndex(index: number): string {
  const r = roundedIndex(index);
  if (r <= 0) return '0×';
  if (r >= 10) return `${r}×`;
  return `${r.toFixed(1)}×`;
}

export function indexBarPct(index: number, max: number): number {
  if (!(max > 0) || !(index > 0)) return 0;
  return Math.min(100, (index / max) * 100);
}

function memberOf(p: Pokemon, picks: number, index: number): LineMember {
  return { id: p.id, name: p.name, sprite: p.sprite, picks, index };
}

function firstStageOf(ids: number[]): Pokemon | null {
  const seed = ids.find((id) => getPokemonById(id));
  if (seed == null) return null;
  const chain = getEvolutionChainIds(seed);
  const mons = chain.map((id) => getPokemonById(id)).filter((p): p is Pokemon => !!p);
  const roots = mons.filter((p) => p.evolvesFrom == null);
  const pool = (roots.length > 0 ? roots : mons).slice();
  pool.sort((a, b) => a.evolutionStage - b.evolutionStage || a.id - b.id);
  return pool[0] ?? null;
}

function groupByChain(ids: Iterable<number>): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (const id of ids) {
    const p = getPokemonById(id);
    if (!p) continue;
    const key = `chain:${p.evolutionChainId}`;
    const list = groups.get(key);
    if (list) {
      if (!list.includes(id)) list.push(id);
    } else {
      groups.set(key, [id]);
    }
  }
  return groups;
}

function sortMembers(ids: number[]): Pokemon[] {
  const mons = ids.map((id) => getPokemonById(id)).filter((p): p is Pokemon => !!p);
  mons.sort((a, b) => a.evolutionStage - b.evolutionStage || a.id - b.id);
  return mons;
}

function countsFrom(rows: [string, number][]): Map<number, number> {
  const out = new Map<number, number>();
  for (const [id, n] of rows) {
    const k = Number(id);
    if (Number.isFinite(k)) out.set(k, n);
  }
  return out;
}

function groupByLine(ids: Iterable<number>): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (const id of ids) {
    if (!getPokemonById(id)) continue;
    const key = lineKey(id);
    const list = groups.get(key);
    if (list) list.push(id);
    else groups.set(key, [id]);
  }
  return groups;
}

function indexOfCount(picks: number, expected: number | null): number {
  if (expected === null) return picks > 0 ? 1 : 0;
  return picks / expected;
}

function lineExpected(universe: Map<string, number[]>, counts: Map<number, number>): number | null {
  let S = 0;
  let L = 0;
  for (const memberIds of universe.values()) {
    L += 1;
    S += linePicks(memberIds, counts);
  }
  return L > 0 && S > 0 ? S / L : null;
}

function speciesExpected(universe: Map<string, number[]>, counts: Map<number, number>): number | null {
  let T = 0;
  let N = 0;
  for (const memberIds of universe.values()) {
    for (const id of memberIds) {
      N += 1;
      T += counts.get(id) ?? 0;
    }
  }
  return N > 0 && T > 0 ? T / N : null;
}

function indexGroups(
  groups: Map<string, number[]>,
  counts: Map<number, number>,
  universe: Map<string, number[]>,
  opts: { firstStageOnly?: boolean } = {},
): RankedLine[] {
  const expected = opts.firstStageOnly
    ? lineExpected(universe, counts)
    : speciesExpected(universe, counts);
  const ranked: RankedLine[] = [];
  for (const [key, memberIds] of groups) {
    if (!opts.firstStageOnly) {
      const mons = sortMembers(memberIds);
      if (mons.length === 0) continue;
      for (const p of mons) {
        const n = counts.get(p.id) ?? 0;
        const speciesIndex = indexOfCount(n, expected);
        ranked.push({
          key: String(p.id),
          members: [memberOf(p, n, speciesIndex)],
          picks: n,
          index: speciesIndex,
          starterType: starterTypeOf(p.id),
        });
      }
      continue;
    }
    const face = firstStageOf(memberIds);
    if (!face) continue;
    const picks = linePicks(memberIds, counts);
    const index = indexOfCount(picks, expected);
    ranked.push({
      key,
      members: [memberOf(face, picks, index)],
      picks,
      index,
      starterType: starterTypeOf(face.id),
    });
  }
  ranked.sort((a, b) => b.index - a.index || b.picks - a.picks || a.members[0].id - b.members[0].id);
  return ranked;
}

function linePicks(memberIds: number[], counts: Map<number, number>): number {
  let max = 0;
  for (const id of memberIds) {
    const n = counts.get(id) ?? 0;
    if (n > max) max = n;
  }
  return max;
}

export function sectionPicksView(
  sectionId: string,
  rows: [string, number][],
  opts: {
    offSection?: boolean;
    excludeOneOffs?: boolean;
    cap?: PicksSplitCap | { maxRows: number; cols: number };
  } = {},
): SectionPicksView | null {
  const raw = countsFrom(rows);
  const counts = new Map<number, number>();
  for (const [id, n] of raw) {
    if (opts.excludeOneOffs && n <= 1) continue;
    counts.set(id, n);
  }

  const group = BUILD_GROUPS.find((g) => g.id === sectionId);
  const catchAll = sectionId === 'other' || group?.filterType === null;
  const pool = catchAll
    ? [...counts.keys()].filter((id) => (counts.get(id) ?? 0) >= 1)
    : [...poolIdsForSection(sectionId)];
  const starters = sectionId === 'starter';
  const inSectionStarters = starters && !opts.offSection;
  const grouper = starters ? groupByChain : groupByLine;
  const universe = grouper(pool);
  if (universe.size === 0) return null;

  let focusIds: number[];
  if (opts.offSection) {
    focusIds = [];
    for (const [id, n] of counts) {
      if (n <= 0) continue;
      if (isOffSection(id, sectionId)) focusIds.push(id);
    }
    if (focusIds.length === 0) return null;
  } else {
    focusIds = pool;
  }

  const focus = grouper(focusIds);
  if (focus.size === 0) return null;
  const ranked = indexGroups(focus, counts, universe, { firstStageOnly: inSectionStarters });
  if (ranked.length === 0) return null;
  if (!opts.offSection && ranked.every((l) => l.picks === 0)) return null;

  if (inSectionStarters) {
    const groups: StarterGroup[] = [];
    for (const type of [...STARTER_TYPES, 'other'] as const) {
      const slice = ranked.filter((l) => l.starterType === type);
      if (slice.length === 0) continue;
      groups.push({ type, most: slice, least: [] });
    }
    if (groups.length === 0) return null;
    return { kind: 'starter', sectionId, groups };
  }

  return {
    kind: 'plain',
    sectionId,
    columns: { most: ranked, least: [] },
  };
}

export function viewsForPicks(
  bySection: Record<string, [string, number][]>,
  opts: {
    offSection?: boolean;
    excludeOneOffs?: boolean;
    cap?: PicksSplitCap | { maxRows: number; cols: number };
  } = {},
): SectionPicksView[] {
  const out: SectionPicksView[] = [];
  let other: SectionPicksView | null = null;
  for (const g of BUILD_GROUPS) {
    const view = sectionPicksView(g.id, bySection[g.id] ?? [], opts);
    if (!view) continue;
    if (g.id === 'other') other = view;
    else out.push(view);
  }
  if (other) out.push(other);
  return out;
}

export function isStarterTypeName(t: string): t is TypeName {
  return t === 'grass' || t === 'fire' || t === 'water';
}

const LEAGUE_PICKS_MAX_ROWS = 4;

export type LeaguePicksSectionId = 'ace' | TypeName | 'none';

interface LeaguePicksSection {
  id: LeaguePicksSectionId;
  lines: RankedLine[];
}

function countLines(rows: LeaguePickRows): RankedLine[] {
  const out: RankedLine[] = [];
  for (const [id, n] of rows) {
    const p = getLeaguePokemonById(Number(id));
    if (!p) continue;
    out.push({ key: id, members: [memberOf(p, n, n)], picks: n, index: n, starterType: 'other' });
  }
  return out;
}

export function leaguePicksSections(picks: LeaguePicks): LeaguePicksSection[] {
  const order: [LeaguePicksSectionId, LeaguePickRows | undefined][] = [
    ['ace', picks.ace],
    ...TYPE_NAMES.map((t): [TypeName, LeaguePickRows | undefined] => [t, picks.byType[t]]),
    ['none', picks.byType.none],
  ];
  const out: LeaguePicksSection[] = [];
  for (const [id, rows] of order) {
    const lines = countLines(rows ?? []).slice(0, LEAGUE_PICKS_MAX_ROWS * PICKS_OFF_COLS);
    if (lines.length > 0) out.push({ id, lines });
  }
  return out;
}
