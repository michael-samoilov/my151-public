import browserIds from './favoriteBrowserIds.json';
import { getPokemonById } from '@/hooks/usePokemonData';
import { savedFavoriteFills } from '@/favorites/model/savedNumbers';

const PICKER_BROWSER_IDS: Readonly<Record<string, number>> = browserIds;

export function favoritePickerIds(raw: string | null, resolveId?: (id: number) => number | undefined): Set<number> {
  const ids = new Set<number>();
  for (const value of Object.values(savedFavoriteFills(raw) ?? {})) {
    const id = resolveId ? resolveId(value) : PICKER_BROWSER_IDS[value] ?? value;
    if (id !== undefined && (resolveId || getPokemonById(id))) ids.add(id);
  }
  return ids;
}

export function readFavoritePickerIds(resolveId?: (id: number) => number | undefined): Set<number> {
  try {
    return favoritePickerIds(localStorage.getItem('favorite-picker'), resolveId);
  } catch {
    return new Set();
  }
}
