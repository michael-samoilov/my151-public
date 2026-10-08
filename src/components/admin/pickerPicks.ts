/** Ranking for the Picker's Most picked page. Pure: reads the catalog only. */
import { labelOf } from '@/favorites/components/spriteLabel';
import { getPickerMon, type PickerMon } from '@/favorites/model/catalog';
import { parseCellKey, type GenAxisId, type TypeAxisId } from '@/favorites/model/cells';
import { eligibleFor, kindFor } from '@/favorites/model/eligibility';
import type { FavoritePicks } from '../../../api/_favoriteAggregate';

export type PickCell = { type: TypeAxisId; gen: GenAxisId };
export type Ranked = { mon: PickerMon; picks: number };

/** Sprite and name for the dashboard's Most picked preview. */
export function pickerFace(id: number): { sprite: string; alt: string; name: string } | undefined {
  const mon = getPickerMon(id);
  if (!mon) return undefined;
  const name = labelOf(mon);
  return { sprite: mon.sprite, alt: name, name };
}

/**
 * A cell's Pokémon, most picked first. Equal counts keep the Picker's own
 * order. A pick cell lists every Pokémon it allows, picked or not. A pointer
 * cell offers each chart its own picks, so it lists only what charts hold.
 */
export function rankCell({ type, gen }: PickCell, rows: [number, number][]): Ranked[] {
  const counts = new Map(rows);
  const pool = kindFor(type, gen) === 'pick' ? eligibleFor(type, gen) : [];
  const inPool = new Set(pool.map((mon) => mon.id));
  const others = rows
    .map(([id]) => id)
    .filter((id) => !inPool.has(id))
    .map(getPickerMon)
    .filter((mon): mon is PickerMon => mon != null);
  return [...pool, ...others]
    .map((mon, at) => ({ mon, picks: counts.get(mon.id) ?? 0, at }))
    .sort((a, b) => b.picks - a.picks || a.at - b.at)
    .map(({ mon, picks }) => ({ mon, picks }));
}

/** Each cell's most-picked Pokémon. The server sorts each cell, so only a tie
 *  at the top needs the cell ranking. */
export function topFills(cells: FavoritePicks['cells']): Record<string, number> {
  const fills: Record<string, number> = {};
  for (const [key, rows] of Object.entries(cells)) {
    if (rows.length === 0) continue;
    if (rows.length === 1 || rows[0][1] > rows[1][1]) {
      fills[key] = rows[0][0];
      continue;
    }
    const cell = parseCellKey(key);
    const top = cell ? rankCell(cell, rows)[0] : undefined;
    if (top && top.picks > 0) fills[key] = top.mon.id;
  }
  return fills;
}
