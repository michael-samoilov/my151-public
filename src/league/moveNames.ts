import { useSyncExternalStore } from 'react';
import { getLocale, subscribe } from '@/i18n/core';
import type { Locale } from '@/i18n/config';
import type { Move } from './moves';

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

export function activeMoveNames(): Promise<void> {
  return loadMoveNames(getLocale());
}

subscribe(() => void activeMoveNames());

const activeNames = (): Record<string, string> | null => loaded.get(getLocale()) ?? null;

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

export function useMoveNames(): Record<string, string> | null {
  return useSyncExternalStore(subscribeMoveNames, activeNames);
}
