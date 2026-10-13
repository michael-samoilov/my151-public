import { useCallback, useEffect, useRef, useState } from 'react';
import { ANALYTICS_UNLOCK_AT } from '@/lib/milestones';
import { buildFavoritesSnapshot } from '../export/snapshot';
import { useFavoritesStore } from '../store/useFavoritesStore';

/**
 * Set once the grid first reaches the Dex builder's Analytics threshold. The
 * unlock is sticky, as in the Dex builder: clearing cells never locks Analytics
 * again. It has its own key so that the saved picks in `favorite-picker` keep
 * their shape, as the completion popup's key does.
 */
const UNLOCK_STORAGE_KEY = 'personal-151-favorites-analytics-v1';

function readUnlocked(): boolean {
  try { return window.localStorage.getItem(UNLOCK_STORAGE_KEY) === '1'; }
  catch { return false; }
}

function markUnlocked() {
  try { window.localStorage.setItem(UNLOCK_STORAGE_KEY, '1'); }
  catch { /* Storage can be unavailable in private browsing. */ }
}

export function filledCount(fills: Readonly<Record<string, number>>): number {
  return buildFavoritesSnapshot(fills).completion.filled;
}

/**
 * Locks the picker's Analytics tab until the grid holds 25 favorites, the Dex
 * builder's threshold, and arms the Dex builder's popup the first time it
 * does. A grid that already holds 25 when the page opens unlocks without the
 * popup, as the Dex seeds `milestoneCelebrated` from a restored dex.
 */
export function useAnalyticsUnlock() {
  const [unlocked, setUnlocked] = useState(
    () => readUnlocked() || filledCount(useFavoritesStore.getState().fills) >= ANALYTICS_UNLOCK_AT,
  );
  const [armed, setArmed] = useState(false);
  // Holds the once-only rule when storage is unavailable.
  const done = useRef(unlocked);
  useEffect(() => {
    if (done.current) {
      markUnlocked();
      return;
    }
    return useFavoritesStore.subscribe((state) => {
      if (done.current || filledCount(state.fills) < ANALYTICS_UNLOCK_AT) return;
      done.current = true;
      markUnlocked();
      setUnlocked(true);
      setArmed(true);
    });
  }, []);
  const dismiss = useCallback(() => setArmed(false), []);
  return { unlocked, armed, dismiss };
}
