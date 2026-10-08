import { useCallback, useEffect, useRef, useState } from 'react';
import { buildFavoritesSnapshot } from '../export/snapshot';
import { useFavoritesStore } from '../store/useFavoritesStore';

/**
 * Set once the completion popup has played in this browser, as the Dex builder
 * persists `milestoneCelebrated`. It has its own key so that the saved picks in
 * `favorite-picker` keep their shape.
 */
const NUDGE_STORAGE_KEY = 'personal-151-favorites-complete-nudge-v1';

function readCelebrated(): boolean {
  try { return window.localStorage.getItem(NUDGE_STORAGE_KEY) === '1'; }
  catch { return false; }
}

function markCelebrated() {
  try { window.localStorage.setItem(NUDGE_STORAGE_KEY, '1'); }
  catch { /* Storage can be unavailable in private browsing. */ }
}

function isComplete(fills: Readonly<Record<string, number>>): boolean {
  const { filled, total } = buildFavoritesSnapshot(fills).completion;
  return filled === total;
}

/**
 * Arms the popup that points at Export the first time the user completes the
 * grid. It plays once per browser: clearing a cell and filling it again does
 * not replay it. A grid that is already complete when the page opens counts as
 * celebrated, as the Dex seeds `milestoneCelebrated` from a restored dex.
 */
export function useCompletionNudge() {
  const [armed, setArmed] = useState(false);
  // Holds the once-only rule when storage is unavailable.
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
