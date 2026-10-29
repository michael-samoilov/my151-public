import { useSyncExternalStore } from 'react';
import { PREVIEW_FEATURES } from '@/lib/demoMode';
import { SHINY_LOOKS, type ShinyLook, type ShinyLookId } from './shinyMarks';

const STORAGE_KEY = 'my151-preview-shiny-look';
const listeners = new Set<() => void>();
let chosen: ShinyLookId = PREVIEW_FEATURES ? stored() : 'gold';

function stored(): ShinyLookId {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    if (id != null && Object.hasOwn(SHINY_LOOKS, id)) return id as ShinyLookId;
  } catch { /* Storage can be unavailable in private browsing. */ }
  return 'gold';
}

/** Switches every on-state mark to a look, and keeps the choice in this browser. Preview builds only. */
export function chooseShinyLook(id: ShinyLookId): void {
  chosen = id;
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* Storage can be unavailable in private browsing. */ }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The chosen look's id, for the preview switch. */
export const useShinyLookId = (): ShinyLookId => useSyncExternalStore(subscribe, () => chosen);

const useChosenLook = (): ShinyLook => SHINY_LOOKS[useShinyLookId()];
const useGold = (): ShinyLook => SHINY_LOOKS.gold;

/** The look every on-state mark draws in. Production has only `gold`, and subscribes to nothing. */
export const useShinyLook = PREVIEW_FEATURES ? useChosenLook : useGold;
