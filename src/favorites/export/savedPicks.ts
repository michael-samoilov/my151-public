import { FAVORITES_STORAGE_KEY, SAVED_PICKS_KEY } from '../store/useFavoritesStore';
import { buildFavoritesSnapshot, type FavoritesCompletion } from './snapshot';

/** Counts the saved picks as the app shows them, and records the count for the hub. */
export function recordSavedPicks(): FavoritesCompletion | null {
  let saved: string | null;
  let fills: unknown;
  try {
    saved = localStorage.getItem(FAVORITES_STORAGE_KEY);
    fills = JSON.parse(saved ?? 'null')?.state?.fills;
  } catch {
    return null;
  }
  if (saved === null || !fills || typeof fills !== 'object' || Array.isArray(fills)) return null;
  const { completion } = buildFavoritesSnapshot(Object.fromEntries(Object.entries(fills).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number',
  )));
  try {
    const record = JSON.stringify({ saved, filled: completion.filled });
    if (localStorage.getItem(SAVED_PICKS_KEY) !== record) localStorage.setItem(SAVED_PICKS_KEY, record);
  } catch {
    // Without the record, the hub's picks line waits for the app.
  }
  return completion;
}
