import { useSyncExternalStore } from 'react';

/**
 * Preview only: how the desktop grow fit rounds its zoom. `fluid` is
 * production (fill the pane), `down` snaps to the largest whole device pixel
 * that fits, `up` reaches the next whole pixel when the pane scrolls 10% or
 * less. `?fit=` picks the start mode.
 */
export type FitMode = 'fluid' | 'down' | 'up';

const MODES: readonly FitMode[] = ['fluid', 'down', 'up'];

function initialMode(): FitMode {
  if (typeof location === 'undefined') return 'fluid';
  const asked = new URLSearchParams(location.search).get('fit');
  return MODES.find((m) => m === asked) ?? 'fluid';
}

let mode = initialMode();
const listeners = new Set<() => void>();

export function getFitMode(): FitMode {
  return mode;
}

export function setFitMode(next: FitMode): void {
  if (next === mode) return;
  mode = next;
  const url = new URL(location.href);
  url.searchParams.set('fit', next);
  history.replaceState(history.state, '', url);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFitMode(): FitMode {
  return useSyncExternalStore(subscribe, getFitMode, getFitMode);
}
