import browserIds from './favoriteBrowserIds.json';
import { getPokemonById } from '@/hooks/usePokemonData';

const PICKER_BROWSER_IDS: Readonly<Record<string, number>> = browserIds;

export function favoritePickerIds(raw: string | null, resolveId?: (id: number) => number | undefined): Set<number> {
  const ids = new Set<number>();
  if (!raw) return ids;
  try {
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || !('state' in saved)) return ids;
    const state = saved.state;
    if (!state || typeof state !== 'object' || !('fills' in state)) return ids;
    const fills = state.fills;
    if (!fills || typeof fills !== 'object' || Array.isArray(fills)) return ids;
    for (const value of Object.values(fills)) {
      if (typeof value !== 'number' || !Number.isSafeInteger(value)) continue;
      const id = resolveId ? resolveId(value) : PICKER_BROWSER_IDS[value] ?? value;
      if (id !== undefined && (resolveId || getPokemonById(id))) ids.add(id);
    }
  } catch {
    return ids;
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
