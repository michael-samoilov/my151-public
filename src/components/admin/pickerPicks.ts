import { labelOf } from '@/favorites/components/spriteLabel';
import { getPickerMon, type PickerMon } from '@/favorites/model/catalog';
import { parseCellKey, type GenAxisId, type TypeAxisId } from '@/favorites/model/cells';
import { eligibleFor, kindFor } from '@/favorites/model/eligibility';
import type { FavoritePicks } from '../../../api/_favoriteAggregate';

export type PickCell = { type: TypeAxisId; gen: GenAxisId };
type Ranked = { mon: PickerMon; picks: number };

export function pickerFace(id: number): { sprite: string; alt: string; name: string } | undefined {
  const mon = getPickerMon(id);
  if (!mon) return undefined;
  const name = labelOf(mon);
  return { sprite: mon.sprite, alt: name, name };
}

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

const compactStrength = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

export function formatPreferenceStrength(score: number): string {
  return `${score < 0.1 ? '<0.1' : score >= 1000 ? compactStrength.format(score) : score.toFixed(1)}×`;
}

export function preferencePreview(preference: FavoritePicks['preference']): [string, number][] {
  if (!preference?.converged || preference.choices <= 0) return [];
  return preference.entries
    .filter((entry) => entry.picks > 0 && entry.evidencePicks > 0 &&
      entry.score != null && Number.isFinite(entry.score) && entry.score > 0)
    .sort((a, b) => b.score! - a.score! || b.picks - a.picks || a.id - b.id)
    .slice(0, 9)
    .map((entry) => [String(entry.id), entry.score!]);
}
