import '../../lib/visitorAtBoot';
import { PRODUCTION_DEPLOY } from '@/lib/demoMode';
import { KANTO_LEAGUE_NAME, kantoCards } from '../data/kantoLeague';
import { allCardsHaveFullTeams, reachedNudges } from '../model/funnelNudges';

export const LEAGUE_STORAGE_KEY = 'league-builder';

export const LEAGUE_PERSIST_VERSION = 7;

function previewLeagueSeed() {
  const cards = kantoCards();
  return {
    state: {
      name: KANTO_LEAGUE_NAME,
      cards,
      celebratedNudges: reachedNudges(cards),
      fullLeagueCelebrated: allCardsHaveFullTeams(cards),
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
