import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { cellKey, isGenNumber, type GenAxisId, type TypeAxisId } from '../model/cells';
import { getPickerMon } from '../model/catalog';
import {
  applyPathToTypeMap,
  applyTypeMapToFills,
  typeMapFromFills,
  type PackMove,
} from '../model/packing';
import { pointerPool, prunePointers } from '../model/pointers';

const FAVORITES_STORAGE_KEY = 'favorite-picker';

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
  return prunePointers(fills);
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
      version: 3,
      migrate: (saved) => {
        const previous = saved as { fills?: Record<string, number> };
        return { ...previous, fills: migrateFavoriteFills(previous.fills ?? {}) } as FavoritesState;
      },
    },
  ),
);
