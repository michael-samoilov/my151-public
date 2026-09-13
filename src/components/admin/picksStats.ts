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
 * Line pick count `p` is the max per-species placement count among members
 * of that line in the section. Species totals cannot name unique dexes, so
 * the max is the lower bound on "this line appeared."
 *
 * Let `L` be the number of default evo lines in the section, and `S` the
 * sum of those lines' pick counts. Random choice among those lines gives
 * each an expected count of `S / L`. The over/under-index is
 *
 *     index = p / (S / L) = p × L / S
 *
 * `1.0×` is the uniform rate. `2.0×` is twice that. Unpicked defaults are
 * `0×`. The Other catch-all uses lines that were actually placed there,
 * not the whole dex.
 *
 * Most-picked ranks default lines only. Off-section is the other tab.
 *
 * Evil Team listed members are often one stage (Rhydon). Other members of
 * that chain (Rhyhorn, Rhyperior) are in-section, not off-section.
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
export const PICKS_MAX_ROWS = 4;
export const STARTER_LINES_PER_TYPE = 4;
export const STARTER_TYPES = ['grass', 'fire', 'water'] as const;

export type StarterType = (typeof STARTER_TYPES)[number] | 'other';

export interface LineMember {
  id: number;
  name: string;
  sprite: string;
  picks: number;
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

export function formatIndex(index: number): string {
  if (!Number.isFinite(index) || index <= 0) return '0×';
  if (index >= 10) return `${Math.round(index)}×`;
  return `${(Math.round(index * 10) / 10).toFixed(1)}×`;
}

/** Fill percent for an index bar scaled to `max` in the same most/least pair. */
export function indexBarPct(index: number, max: number): number {
  if (!(max > 0) || !(index > 0)) return 0;
  return Math.min(100, (index / max) * 100);
}

function memberOf(p: Pokemon, picks: number): LineMember {
  return { id: p.id, name: p.name, sprite: p.sprite, picks };
}

function sortMembers(ids: number[]): Pokemon[] {
  const mons = ids.map((id) => getPokemonById(id)).filter((p): p is Pokemon => !!p);
  mons.sort((a, b) => a.evolutionStage - b.evolutionStage || a.id - b.id);
  return mons;
}

/** How many 6-wide rows `lines` occupy, packing like the sprite grid. */
export function rowsUsed(lines: { members: readonly unknown[] }[], cols = PICKS_COLS): number {
  let rows = 0;
  let col = 0;
  const close = () => {
    rows += 1;
    col = 0;
  };
  for (const line of lines) {
    let remaining = line.members.length;
    if (remaining === 0) continue;
    while (remaining > 0) {
      const piece = Math.min(remaining, cols);
      if (col > 0 && col + piece > cols) close();
      col += piece;
      remaining -= piece;
      if (col === cols) close();
    }
  }
  if (col > 0) rows += 1;
  return rows;
}

function takeUntilCap<T extends { key: string; members: readonly unknown[] }>(
  lines: T[],
  cap: { maxRows: number; cols: number } | { maxLines: number },
): T[] {
  if ('maxLines' in cap) return lines.slice(0, cap.maxLines);
  const kept: T[] = [];
  for (const line of lines) {
    const next = [...kept, line];
    if (rowsUsed(next, cap.cols) > cap.maxRows) break;
    kept.push(line);
  }
  return kept;
}

/** Highest-index lines on the left, lowest on the right. No line in both. */
export function splitMostLeast<T extends { key: string; members: readonly unknown[] }>(
  rankedDesc: T[],
  cap: { maxRows: number; cols: number } | { maxLines: number },
): { most: T[]; least: T[] } {
  const most = takeUntilCap(rankedDesc, cap);
  const mostKeys = new Set(most.map((l) => l.key));
  const rest = rankedDesc.filter((l) => !mostKeys.has(l.key));
  let least = takeUntilCap(rest.toReversed(), cap);
  if (least.length === 0 && most.length > 1) {
    const mid = Math.ceil(most.length / 2);
    least = most.slice(mid).toReversed();
    return { most: most.slice(0, mid), least };
  }
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

/**
 * Index `groups` against expected count `S / L` from `universe`.
 * Off-section lines use the section's default universe as the 1× baseline.
 */
export function indexGroups(
  groups: Map<string, number[]>,
  counts: Map<number, number>,
  universe: Map<string, number[]>,
): RankedLine[] {
  let S = 0;
  let L = 0;
  for (const memberIds of universe.values()) {
    L += 1;
    S += linePicks(memberIds, counts);
  }
  const expected = L > 0 && S > 0 ? S / L : null;
  const ranked: RankedLine[] = [];
  for (const [key, memberIds] of groups) {
    const mons = sortMembers(memberIds);
    if (mons.length === 0) continue;
    const members = mons.map((p) => memberOf(p, counts.get(p.id) ?? 0));
    const picks = linePicks(memberIds, counts);
    const index = expected === null ? (picks > 0 ? 1 : 0) : picks / expected;
    ranked.push({
      key,
      members,
      picks,
      index,
      starterType: starterTypeOf(mons[0].id),
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
  opts: { offSection?: boolean; excludeOneOffs?: boolean } = {},
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
  const universe = groupByLine(pool);
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

  const focus = groupByLine(focusIds);
  if (focus.size === 0) return null;
  const ranked = indexGroups(focus, counts, universe);
  if (ranked.length === 0) return null;
  if (!opts.offSection && ranked.every((l) => l.picks === 0)) return null;

  if (sectionId === 'starter') {
    const groups: StarterGroup[] = [];
    for (const type of [...STARTER_TYPES, 'other'] as const) {
      const slice = ranked.filter((l) => l.starterType === type);
      if (slice.length === 0) continue;
      const columns = splitMostLeast(slice, { maxLines: STARTER_LINES_PER_TYPE });
      groups.push({ type, ...columns });
    }
    if (groups.length === 0) return null;
    return { kind: 'starter', sectionId, groups };
  }

  return {
    kind: 'plain',
    sectionId,
    columns: splitMostLeast(ranked, { maxRows: PICKS_MAX_ROWS, cols: PICKS_COLS }),
  };
}

export function viewsForPicks(
  bySection: Record<string, [string, number][]>,
  opts: { offSection?: boolean; excludeOneOffs?: boolean } = {},
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
