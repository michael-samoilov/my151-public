/**
 * Ranking for the admin "What people pick" page.
 *
 * Index definition
 * ----------------
 * An evo line is the linear path `getEvolutionLine(id)`: root to one leaf.
 * Pikachu + Raichu without Pichu is still the Pichu–Pikachu–Raichu line.
 * Branched families split by leaf: Eevee→Vaporeon is not Eevee→Jolteon.
 * A lone Eevee joins whichever branch `getEvolutionLine(133)` walks first.
 *
 * Each species keeps its own pick count. The over/under-index is that count
 * against the uniform rate among default species in the section:
 *
 *     expected = T / N
 *     index = picks / expected
 *
 * `N` is the number of default species in the section. `T` is the sum of
 * their pick counts. `1.0×` is the uniform rate. Unpicked defaults are `0×`.
 * Lines stay grouped for ranking and display order: a line's `picks` and
 * `index` are the max among its members. In-section Starters still show one
 * first-stage face per chain, indexed from that chain's max picks against
 * the line-level uniform rate (`S / L`).
 *
 * Most-picked ranks default lines only, and only lines above 1.10×.
 * Least-picked is only lines below 0.90×. In-section Starters list every
 * first-stage Pokémon across the full row, split grass / fire / water, with
 * no most/least split and no 1.10× cutoff. The starter grid uses one full-width
 * row per type with column count = starter generation count from the Starter
 * category (today nine). Other in-section sections use the 6+3 combined row.
 * Sprite packing wraps mid-line to fill the row. Off-section has no least
 * column, shows raw dex counts, never uses the starter type split or
 * first-stage-only faces, lays the sprite grid 9 columns wide, and does not
 * cap rows. One-off off-section placements stay visible unless Exclude
 * one-offs is on.
 */
import { ARCHETYPES } from '@/data/archetypes';
import { getCategoryById } from '@/data/categories';
import { BUILD_GROUPS } from '@/data/slot-template';
import {
  getAllPokemon,
  getEvolutionChainIds,
  getEvolutionLine,
  getPokemonById,
} from '@/hooks/usePokemonData';
import type { Pokemon, TypeName } from '@/types/pokemon';

export const PICKS_COLS = 6;
/** Desktop most|least row: six for most, three for least. */
export const PICKS_MOST_COLS = PICKS_COLS;
export const PICKS_LEAST_DESKTOP_COLS = 3;
/** Least column width in the combined most|least row (all viewports). */
export const PICKS_LEAST_COLS = PICKS_LEAST_DESKTOP_COLS;
export const PICKS_COMBINED_COLS = PICKS_MOST_COLS + PICKS_LEAST_DESKTOP_COLS;
/** Legacy 12-col track count; off-section and the suite strip use 9. */
export const PICKS_PAIR_COLS = 12;
/** Off-section grid: 9 columns on phone and desktop, matching Most picked. */
export const PICKS_OFF_COLS = PICKS_COMBINED_COLS;
export const PICKS_OFF_DESKTOP_COLS = PICKS_OFF_COLS;
export const PICKS_MAX_ROWS = 4;
export const PICKS_GRID_CAP = { maxRows: PICKS_MAX_ROWS, cols: PICKS_COLS } as const;

type GridCap = { maxRows: number; cols: number } | { maxLines: number };

/** Full-width grids (off-section) are 9 columns. Most/least halves stay 6. */
export function picksGridCols(wide: boolean, _desktop: boolean): number {
  return wide ? PICKS_OFF_COLS : PICKS_COLS;
}

/** In-section starter row width: one column per main-series generation in the Starter category. */
export function starterGenerationCount(): number {
  const cat = getCategoryById('starter');
  const groups = cat?.subgroups ?? [];
  let n = 0;
  for (const sg of groups) {
    if (/^Generation \d+$/.test(sg.label)) n += 1;
  }
  return n > 0 ? n : 1;
}

/** In-section starters use one row across the section at generation count. */
export function picksStarterCols(): number {
  return starterGenerationCount();
}

export function picksGridCap(offSection: boolean, desktop: boolean): { maxRows: number; cols: number } {
  return {
    maxRows: offSection ? Number.POSITIVE_INFINITY : PICKS_MAX_ROWS,
    cols: picksGridCols(offSection, desktop),
  };
}

export type PicksSplitCap =
  | { kind: 'single'; cap: GridCap }
  | { kind: 'dual'; most: GridCap; least: GridCap };

/** Row caps for most/least lists on the What people pick page. */
export function picksSplitCap(offSection: boolean, desktop: boolean): PicksSplitCap {
  if (offSection) {
    return {
      kind: 'single',
      cap: { maxRows: Number.POSITIVE_INFINITY, cols: picksGridCols(true, desktop) },
    };
  }
  const most: GridCap = PICKS_GRID_CAP;
  const least: GridCap = { maxRows: PICKS_MAX_ROWS, cols: PICKS_LEAST_COLS };
  return { kind: 'dual', most, least };
}
export const MOST_MIN_INDEX = 1.1;
export const LEAST_MAX_INDEX = 0.9;
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

/** True when this species is not a default option for the section it landed in. */
export function isOffSection(id: number, sectionId: string): boolean {
  if (sectionId === 'other') return false;
  return !(DEFAULT_SECTIONS_OF.get(id)?.has(sectionId) ?? false);
}

export function poolIdsForSection(sectionId: string): readonly number[] {
  return POOL_BY_SECTION.get(sectionId) ?? [];
}

/** Linear evo-line key: root-to-leaf ids joined. Same key ⇒ same line. */
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

export function roundedIndex(index: number): number {
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

/** Fill percent for an index bar scaled to `max` in the same most/least pair. */
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

/** How many rows `lines` occupy when members wrap mid-line. */
export function rowsUsed(lines: { members: readonly unknown[] }[], cols = PICKS_COLS): number {
  let n = 0;
  for (const line of lines) n += line.members.length;
  if (n === 0) return 0;
  return Math.ceil(n / cols);
}

function takeUntilCap<T extends { key: string; members: readonly unknown[] }>(
  lines: T[],
  cap: GridCap,
): T[] {
  if ('maxLines' in cap) return lines.slice(0, cap.maxLines);
  if (!Number.isFinite(cap.maxRows)) return [...lines];
  const kept: T[] = [];
  for (const line of lines) {
    const next = [...kept, line];
    if (rowsUsed(next, cap.cols) > cap.maxRows) break;
    kept.push(line);
  }
  return kept;
}

/**
 * Split ranked-desc lines into most and least sprite-grid lists.
 *
 * `most` is the highest-index lines that fit the cap. When `minMostIndex` is
 * set, a line must sit strictly above that index. `least` is the lowest-index
 * lines that are not in most, strictly below `maxLeastIndex` when set, ordered
 * so the lowest sits last. Off-section passes `includeLeast: false`.
 */
export function splitMostLeast<T extends { key: string; index: number; members: readonly unknown[] }>(
  rankedDesc: T[],
  cap: GridCap | PicksSplitCap,
  opts: { minMostIndex?: number; maxLeastIndex?: number; includeLeast?: boolean } = {},
): { most: T[]; least: T[] } {
  const includeLeast = opts.includeLeast !== false;
  const minMost = opts.minMostIndex;
  const maxLeast = opts.maxLeastIndex;
  const mostCap =
    'kind' in cap && cap.kind === 'single' ? cap.cap : 'kind' in cap ? cap.most : cap;
  const leastCap =
    'kind' in cap && cap.kind === 'single' ? cap.cap : 'kind' in cap ? cap.least : cap;
  let over = minMost == null ? rankedDesc : rankedDesc.filter((l) => roundedIndex(l.index) > minMost);
  if (maxLeast != null) over = over.filter((l) => roundedIndex(l.index) >= maxLeast);
  const most = takeUntilCap(over, mostCap);
  if (!includeLeast) return { most, least: [] };
  const mostKeys = new Set(most.map((l) => l.key));
  let rest = rankedDesc.filter((l) => !mostKeys.has(l.key));
  if (maxLeast != null) rest = rest.filter((l) => roundedIndex(l.index) < maxLeast);
  const least = takeUntilCap(rest.toReversed(), leastCap).toReversed();
  return { most, least };
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

/**
 * Index `groups` against the section universe.
 * Species (default) use `T / N`. First-stage starter faces use `S / L`.
 * Off-section lines use the section's default universe as the 1× baseline.
 */
export function indexGroups(
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
    let members: LineMember[];
    let typeId: number;
    let picks: number;
    let index: number;
    if (opts.firstStageOnly) {
      const face = firstStageOf(memberIds);
      if (!face) continue;
      picks = linePicks(memberIds, counts);
      index = indexOfCount(picks, expected);
      members = [memberOf(face, picks, index)];
      typeId = face.id;
    } else {
      const mons = sortMembers(memberIds);
      if (mons.length === 0) continue;
      members = mons.map((p) => {
        const n = counts.get(p.id) ?? 0;
        return memberOf(p, n, indexOfCount(n, expected));
      });
      picks = 0;
      index = 0;
      for (const m of members) {
        if (m.picks > picks) picks = m.picks;
        if (m.index > index) index = m.index;
      }
      typeId = mons[0].id;
    }
    ranked.push({
      key,
      members,
      picks,
      index,
      starterType: starterTypeOf(typeId),
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
  const catchAll = group?.filterType === null;
  const pool = catchAll ? [...counts.keys()] : [...poolIdsForSection(sectionId)];
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

  const cap: GridCap | PicksSplitCap = opts.offSection
    ? opts.cap && 'kind' in opts.cap
      ? opts.cap
      : {
          kind: 'single',
          cap: {
            maxRows: Number.POSITIVE_INFINITY,
            cols: opts.cap && 'cols' in opts.cap ? opts.cap.cols : PICKS_COLS,
          },
        }
    : (opts.cap ?? { kind: 'dual', most: PICKS_GRID_CAP, least: PICKS_GRID_CAP });
  const splitOpts = {
    minMostIndex: starters || opts.offSection ? undefined : MOST_MIN_INDEX,
    maxLeastIndex: opts.offSection ? undefined : LEAST_MAX_INDEX,
    includeLeast: !opts.offSection,
  };

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
    columns: splitMostLeast(ranked, cap, splitOpts),
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
  for (const g of BUILD_GROUPS) {
    const view = sectionPicksView(g.id, bySection[g.id] ?? [], opts);
    if (view) out.push(view);
  }
  return out;
}

export function isStarterTypeName(t: string): t is TypeName {
  return t === 'grass' || t === 'fire' || t === 'water';
}
