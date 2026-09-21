import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { cellKey, isGenNumber, isTypeName, type GenAxisId, type TypeAxisId } from '../model/cells';
import { getPickerMon, type PickerMon } from '../model/catalog';
import {
  applyPathToTypeMap,
  applyTypeMapToFills,
  typeMapFromFills,
  type PackMove,
} from '../model/packing';
import { prunePointers } from '../model/pointers';

export const FAVORITES_STORAGE_KEY = 'favorite-picker';

export interface FavoritesState {
  fills: Record<string, number>;
  place: (type: TypeAxisId, gen: GenAxisId, id: number) => void;
  applyPack: (gen: number, path: PackMove[]) => void;
  clear: (type: TypeAxisId, gen: GenAxisId) => void;
}

export function placedMon(
  fills: Record<string, number>,
  type: TypeAxisId,
  gen: GenAxisId,
): PickerMon | undefined {
  const id = fills[cellKey(type, gen)];
  return id == null ? undefined : getPickerMon(id);
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set) => ({
      fills: {},
      place: (type, gen, id) =>
        set((s) => {
          const next = { ...s.fills, [cellKey(type, gen)]: id };
          if (isTypeName(type) && isGenNumber(gen)) {
            // Uniqueness among the 18 type cells of this generation: a direct
            // place that relocates clears the origin. Occupied dests go through
            // applyPack instead.
            const dest = type;
            const map = typeMapFromFills(next, gen, getPickerMon);
            const from = Object.entries(map).find(([t, m]) => m.id === id && t !== dest);
            if (from) delete next[cellKey(from[0] as TypeAxisId, gen)];
          }
          return { fills: prunePointers(next) };
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
    { name: FAVORITES_STORAGE_KEY, version: 1 },
  ),
);
