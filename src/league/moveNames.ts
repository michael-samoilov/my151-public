import { useSyncExternalStore } from 'react';
import { getLocale, subscribe } from '@/i18n/core';
import type { Locale } from '@/i18n/config';
import type { Move } from './moves';

/**
 * Move names in the active language, from the games' own text
 * (`npm run i18n:terms` writes them from docs/i18n/sources/move-names.json).
 *
 * English is `Move.name` and costs nothing. The other eight are 845 names each,
 * which only the league builder needs, so each loads as its own chunk when its
 * language becomes active, the way the Pokémon names do. Until it lands a name
 * reads in English.
 */
const SOURCES = import.meta.glob<Record<string, string>>('../i18n/moves/*.json', { import: 'default' });

const loaded = new Map<Locale, Record<string, string>>();
const inFlight = new Map<Locale, Promise<void>>();
const listeners = new Set<() => void>();

function loadMoveNames(locale: Locale): Promise<void> {
  if (loaded.has(locale)) return Promise.resolve();
  const load = SOURCES[`../i18n/moves/${locale}.json`];
  if (!load) return Promise.resolve();
  let pending = inFlight.get(locale);
  if (!pending) {
    pending = load()
      .then((names) => {
        loaded.set(locale, names);
        listeners.forEach((cb) => cb());
      })
      .finally(() => inFlight.delete(locale));
    inFlight.set(locale, pending);
  }
  return pending;
}

/** The names for the active locale, fetched now if they are not here yet. */
export function activeMoveNames(): Promise<void> {
  return loadMoveNames(getLocale());
}

// Start the fetch the moment a locale is installed, alongside the Pokémon
// names, rather than when the first move renders.
subscribe(() => void activeMoveNames());

const activeNames = (): Record<string, string> | null => loaded.get(getLocale()) ?? null;

/** The move's name in the active language, or in English until that arrives. */
export function moveName(move: Move): string {
  return activeNames()?.[move.id] ?? move.name;
}

function subscribeMoveNames(cb: () => void): () => void {
  const off = subscribe(cb);
  listeners.add(cb);
  return () => {
    off();
    listeners.delete(cb);
  };
}

/**
 * The active locale's names, or null while they load (and in English). The
 * component re-renders when a download lands or the locale switches.
 */
export function useMoveNames(): Record<string, string> | null {
  return useSyncExternalStore(subscribeMoveNames, activeNames);
}
