import { useCallback, useEffect, useRef, useState } from 'react';
import { ANALYTICS_UNLOCK_AT } from '@/lib/milestones';
import { buildFavoritesSnapshot } from '../export/snapshot';
import { useFavoritesStore } from '../store/useFavoritesStore';

const UNLOCK_STORAGE_KEY = 'personal-151-favorites-analytics-v1';

function readUnlocked(): boolean {
  try { return window.localStorage.getItem(UNLOCK_STORAGE_KEY) === '1'; }
  catch { return false; }
}

function markUnlocked() {
  try { window.localStorage.setItem(UNLOCK_STORAGE_KEY, '1'); }
  catch { /* platform: Storage access can throw in private browsing. */ }
}

export function filledCount(fills: Readonly<Record<string, number>>): number {
  return buildFavoritesSnapshot(fills).completion.filled;
}

export function useAnalyticsUnlock() {
  const [unlocked, setUnlocked] = useState(
    () => readUnlocked() || filledCount(useFavoritesStore.getState().fills) >= ANALYTICS_UNLOCK_AT,
  );
  const [armed, setArmed] = useState(false);
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
