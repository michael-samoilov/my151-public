export const VISITED_KEY = 'p151-visited';
export const RETURNING_KEYS = [VISITED_KEY, 'p151-cid', 'p151-moved-notice-seen', 'p151-league-promo-seen'];

export const isReturningVisitor = (() => {
  try {
    if (RETURNING_KEYS.some(key => localStorage.getItem(key) !== null)) return true;
    const state = (key: string) => {
      try { return JSON.parse(localStorage.getItem(key) ?? 'null')?.state; }
      catch { return null; }
    };
    const dex = state('personal-151-pokedex-v3');
    const league = state('league-builder');
    const favorites = state('favorite-picker');
    return Object.values(dex?.sections ?? {}).some(ids => Array.isArray(ids) && ids.length > 0)
      || (Array.isArray(league?.cards) && league.cards.some((card: { lines?: unknown[] }) => card.lines?.length))
      || Object.values(favorites?.fills ?? {}).some(id => typeof id === 'number');
  } catch {
    return false;
  }
})();
