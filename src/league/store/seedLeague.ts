import { PRODUCTION_DEPLOY } from '@/lib/demoMode';
import { KANTO_LEAGUE_NAME, kantoCards } from '../data/kantoLeague';
import { reachedNudges } from '../model/funnelNudges';

/**
 * Seed a Kanto league on a preview build's first visit.
 *
 * Feature work needs a full template to look at, and an empty one is a poor
 * place to judge a change to a card. This writes the store's own persisted
 * shape before the store reads it, so the app hydrates from the seed with no
 * extra state and no migration.
 *
 * Three guards, and the change is invisible if any of them holds:
 *
 * 1. Never on production. The live app opens empty, as it always has.
 * 2. Never when the key exists. A returning visitor keeps their league, and
 *    someone who deliberately cleared theirs keeps it cleared — "the key is
 *    missing" means a first visit, where "every card is empty" does not.
 * 3. Never outside a browser, and never past a storage error.
 */

export const LEAGUE_STORAGE_KEY = 'league-builder';

/** The store's persisted version. `useLeagueStore` reads this same constant. */
export const LEAGUE_PERSIST_VERSION = 2;

/**
 * The record `seedLeagueOnFirstVisit` writes. Kanto already has full trainer
 * cards, so `celebratedNudges` is filled in here — otherwise the export
 * popups would fire on a preview's first paint.
 */
export function previewLeagueSeed() {
  const cards = kantoCards();
  return {
    state: {
      name: KANTO_LEAGUE_NAME,
      cards,
      celebratedNudges: reachedNudges(cards),
    },
    version: LEAGUE_PERSIST_VERSION,
  };
}

export function seedLeagueOnFirstVisit(): void {
  if (PRODUCTION_DEPLOY) return;
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (window.localStorage.getItem(LEAGUE_STORAGE_KEY) !== null) return;
    window.localStorage.setItem(LEAGUE_STORAGE_KEY, JSON.stringify(previewLeagueSeed()));
  } catch {
    // A blocked or full localStorage is not worth a broken page: the app
    // opens on an empty league, which is what it did before the seed.
  }
}
