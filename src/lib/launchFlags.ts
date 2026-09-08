/**
 * Once-per-browser flags for the launch of the hub and the gym leader maker.
 *
 * Two prompts exist for people who used the site before the launch, and each
 * shows once:
 *
 *  - On the hub, a returning visitor with a saved dex sees where the Pokédex
 *    builder went. Seeing the hub at all is also seeing the gym leader card,
 *    so the hub marks the league promo as seen too.
 *  - In the dex builder, a returning visitor sees the gym leader maker
 *    callout, unless the hub already showed them the card.
 *
 * localStorage may be unavailable; every read defaults to "not seen" and
 * every write is best-effort, so the worst case is one repeat.
 */
export const LEAGUE_PROMO_SEEN_KEY = 'p151-league-promo-seen';
export const MOVED_NOTICE_SEEN_KEY = 'p151-moved-notice-seen';

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
    // storage unavailable — the prompt may show once more
  }
}

export const isLeaguePromoSeen = () => seen(LEAGUE_PROMO_SEEN_KEY);
export const markLeaguePromoSeen = () => mark(LEAGUE_PROMO_SEEN_KEY);
export const isMovedNoticeSeen = () => seen(MOVED_NOTICE_SEEN_KEY);
export const markMovedNoticeSeen = () => mark(MOVED_NOTICE_SEEN_KEY);
