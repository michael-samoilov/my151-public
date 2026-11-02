import { FAVORITES_STORAGE_KEY, SAVED_PICKS_KEY } from '../store/useFavoritesStore';
import { buildFavoritesSnapshot, type FavoritesCompletion } from './snapshot';
import { savedFavoriteFills } from '../model/savedNumbers';

export function recordSavedPicks(): FavoritesCompletion | null {
  let saved: string | null;
  try {
    saved = localStorage.getItem(FAVORITES_STORAGE_KEY);
  } catch {
    return null;
  }
  const fills = savedFavoriteFills(saved);
  if (saved === null || !fills) return null;
  const { completion } = buildFavoritesSnapshot(fills);
  try {
    const record = JSON.stringify({ saved, filled: completion.filled });
    if (localStorage.getItem(SAVED_PICKS_KEY) !== record) localStorage.setItem(SAVED_PICKS_KEY, record);
  } catch {}
  return completion;
}
