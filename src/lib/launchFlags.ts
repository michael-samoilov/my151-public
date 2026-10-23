const LEAGUE_PROMO_SEEN_KEY = 'p151-league-promo-seen';
export const FAVORITES_NOTICE_SEEN_KEY = 'p151-favorites-launch-seen';
import { VISITED_KEY } from './visitorAtBoot';
export { isReturningVisitor } from './visitorAtBoot';

export const FAVORITES_NOTICE_START = Date.parse('2026-10-06T00:00:00-04:00');
export const FAVORITES_NOTICE_END = Date.parse('2026-10-13T00:00:00-04:00');
export const isFavoritesNoticeWindow = (now = Date.now()) =>
  now >= FAVORITES_NOTICE_START && now < FAVORITES_NOTICE_END;

export const markVisited = () => mark(VISITED_KEY);
export const isFavoritesNoticeSeen = () => seen(FAVORITES_NOTICE_SEEN_KEY);
export const markFavoritesNoticeSeen = () => mark(FAVORITES_NOTICE_SEEN_KEY);

function seen(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function mark(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    return;
  }
}

export const isLeaguePromoSeen = () => seen(LEAGUE_PROMO_SEEN_KEY);
export const markLeaguePromoSeen = () => mark(LEAGUE_PROMO_SEEN_KEY);
