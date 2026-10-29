import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { cellKey, isGenNumber, parseCellKey, type GenAxisId, type TypeAxisId } from '../model/cells';
import { getPickerMon } from '../model/catalog';
import { eligibleFor, kindFor } from '../model/eligibility';
import {
  applyPathToTypeMap,
  applyTypeMapToFills,
  typeMapFromFills,
  type PackMove,
} from '../model/packing';
import { pointerPool, prunePointers } from '../model/pointers';

export const FAVORITES_STORAGE_KEY = 'favorite-picker';
/**
 * The picks count the app shows, with the exact saved picker data it was
 * counted from (`recordSavedPicks`). The hub's boot script shows it before the
 * app runs only while that data is unchanged: it cannot check picks itself, so
 * it never shows a count the app would then correct.
 */
export const SAVED_PICKS_KEY = 'p151-hub-picks';

export function migrateFavoriteFills(saved: Record<string, number>): Record<string, number> {
  const fills = { ...saved };
  const lgpeStarter = fills['starter|7'];
  if (fills['starter|1'] == null && (lgpeStarter === 10158 || lgpeStarter === 10159)) {
    fills['starter|1'] = lgpeStarter === 10158 ? 25 : 133;
  }
  for (const [key, id] of Object.entries(fills)) {
    if (id === 10158 || id === 10159) delete fills[key];
  }
  const previousGimmickLegendary = fills['gimmick|legendary'];
  delete fills['gimmick|legendary'];
  if (fills['legendary|gimmick'] == null && previousGimmickLegendary != null) {
    fills['legendary|gimmick'] = previousGimmickLegendary;
  }
  const previousGimmickFavorite = fills['gimmick|favorite'] ?? fills['favorite|gimmick'];
  delete fills['gimmick|favorite'];
  delete fills['favorite|gimmick'];
  if (fills['gimmick|gimmick'] == null && previousGimmickFavorite != null
    && pointerPool('gimmick', 'gimmick', fills).includes(previousGimmickFavorite)) {
    fills['gimmick|gimmick'] = previousGimmickFavorite;
  }
  migrateRetypedForms(fills);
  return prunePointers(fills);
}

/** Stereo Rotom became Electric/Normal and Terastal Ogerpon took its single Tera type on 2026-10-20.
 *  A saved pick that no longer fits its cell becomes the same mask's Grass form when that fits, or is cleared. */
const TERASTAL_MASK: Record<number, number> = { 11114: 10273, 11115: 10274, 11116: 10275 };
const RETYPED = new Set([11112, 11114, 11115, 11116]);

function migrateRetypedForms(fills: Record<string, number>) {
  const retyped = Object.entries(fills).flatMap(([key, id]) => {
    const cell = parseCellKey(key);
    return cell && RETYPED.has(id) ? [{ key, id, ...cell, kind: kindFor(cell.type, cell.gen) }] : [];
  });
  for (const { key, id, type, gen } of retyped.filter((cell) => cell.kind === 'pick')) {
    const fits = (candidate: number) => eligibleFor(type, gen).some((mon) => mon.id === candidate);
    if (fits(id)) continue;
    const mask = TERASTAL_MASK[id];
    if (mask != null && fits(mask)) fills[key] = mask;
    else delete fills[key];
  }
  for (const { key, id, type, gen } of retyped.filter((cell) => cell.kind === 'pointer')) {
    const pool = pointerPool(type, gen, fills);
    const mask = TERASTAL_MASK[id];
    if (!pool.includes(id) && mask != null && pool.includes(mask)) fills[key] = mask;
  }
}

interface FavoritesState {
  fills: Record<string, number>;
  place: (type: TypeAxisId, gen: GenAxisId, id: number) => void;
  applyPack: (gen: number, path: PackMove[]) => void;
  clear: (type: TypeAxisId, gen: GenAxisId) => void;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set) => ({
      fills: {},
      place: (type, gen, id) =>
        set((s) => {
          const placed = { ...s.fills, [cellKey(type, gen)]: id };
          return { fills: prunePointers(placed) };
        }),
      applyPack: (gen, path) =>
        set((s) => {
          if (!isGenNumber(gen)) return s;
          const map = typeMapFromFills(s.fills, gen, getPickerMon);
          const packed = applyPathToTypeMap(map, path);
          return { fills: prunePointers(applyTypeMapToFills(s.fills, gen, packed)) };
        }),
      clear: (type, gen) =>
        set((s) => {
          const next = { ...s.fills };
          delete next[cellKey(type, gen)];
          return { fills: prunePointers(next) };
        }),
    }),
    {
      name: FAVORITES_STORAGE_KEY,
      version: 4,
      migrate: (saved) => {
        const previous = saved as { fills?: Record<string, number> };
        return { ...previous, fills: migrateFavoriteFills(previous.fills ?? {}) } as FavoritesState;
      },
    },
  ),
);
