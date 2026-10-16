import type { NoArgKey } from '../../i18n/types';

export type FaqPage = 'hub' | 'dex' | 'league' | 'favorites';

export const FAQ_KEYS: Record<FaqPage, readonly (readonly [NoArgKey, NoArgKey])[]> = {
  hub: [
    ['faq.hub.q1', 'faq.hub.a1'],
    ['faq.hub.q2', 'faq.hub.a2'],
    ['faq.hub.q3', 'faq.hub.a3'],
  ],
  dex: [
    ['faq.dex.q1', 'faq.dex.a1'],
    ['faq.dex.q2', 'faq.dex.a2'],
    ['faq.dex.q3', 'faq.dex.a3'],
    ['faq.dex.q4', 'faq.dex.a4'],
  ],
  league: [
    ['faq.league.q1', 'faq.league.a1'],
    ['faq.league.q2', 'faq.league.a2'],
    ['faq.league.q3', 'faq.league.a3'],
  ],
  favorites: [
    ['faq.favorites.q1', 'faq.favorites.a1'],
    ['faq.favorites.q2', 'faq.favorites.a2'],
    ['faq.favorites.q3', 'faq.favorites.a3'],
    ['faq.favorites.q4', 'faq.favorites.a4'],
    ['faq.favorites.q5', 'faq.favorites.a5'],
  ],
};
