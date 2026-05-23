import { useSyncExternalStore } from 'react';

/**
 * DEBUG-ONLY live-tunable sprite sizing. Lets us drag sprite size on a
 * deployed preview to find the sweet spot for overlap / aliasing without
 * pushing a new build per value. Remove this module + the slider +
 * the store reads in PokemonTile.tsx before merging to production.
 *
 *   imgScale    — multiplier on the 96px source for the sprite <img>
 *                 (default 2.0 = render at 192 source px).
 *   chromeBoost — multiplier on the --tile-sprite layout var that the
 *                 name / type badges / gen badge / padding scale off
 *                 (default 1.4).
 */
const STORAGE_KEY = 'debug-sprite-scale';
export const DEBUG_SPRITE_DEFAULTS = { imgScale: 2.0, chromeBoost: 1.4 };

export interface DebugSpriteState {
  imgScale: number;
  chromeBoost: number;
}

function load(): DebugSpriteState {
  if (typeof localStorage === 'undefined') return { ...DEBUG_SPRITE_DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEBUG_SPRITE_DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore parse errors */ }
  return { ...DEBUG_SPRITE_DEFAULTS };
}

let state: DebugSpriteState = load();
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function setDebugSpriteScale(patch: Partial<DebugSpriteState>): void {
  state = { ...state, ...patch };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((fn) => fn());
}

export function useDebugSpriteScale(): DebugSpriteState {
  return useSyncExternalStore(subscribe, () => state, () => DEBUG_SPRITE_DEFAULTS);
}
