import { useCallback, useEffect, useRef, useState } from 'react';
import { buildFavoritesSnapshot } from '../export/snapshot';
import { useFavoritesStore } from '../store/useFavoritesStore';

const NUDGE_STORAGE_KEY = 'personal-151-favorites-complete-nudge-v1';

function readCelebrated(): boolean {
  try { return window.localStorage.getItem(NUDGE_STORAGE_KEY) === '1'; }
  catch { return false; }
}

function markCelebrated() {
  try { window.localStorage.setItem(NUDGE_STORAGE_KEY, '1'); }
  catch { /* platform: Storage access can throw in private browsing. */ }
}

function isComplete(fills: Readonly<Record<string, number>>): boolean {
  const { filled, total } = buildFavoritesSnapshot(fills).completion;
  return filled === total;
}

export function useCompletionNudge() {
  const [armed, setArmed] = useState(false);
  const played = useRef(false);
  useEffect(() => {
    if (isComplete(useFavoritesStore.getState().fills)) markCelebrated();
    return useFavoritesStore.subscribe((state, previous) => {
      if (played.current || readCelebrated() || !isComplete(state.fills) || isComplete(previous.fills)) return;
      played.current = true;
      markCelebrated();
      setArmed(true);
    });
  }, []);
  const dismiss = useCallback(() => setArmed(false), []);
  return { armed, dismiss };
}
