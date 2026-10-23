import { PRODUCTION_DEPLOY } from '@/lib/demoMode';
import { DEFAULT_SORT_ORDER, formatSortOrder, parseSortOrder, type SortOrder } from './sortKeys';

export const SORT_DEBUG_ENABLED = !PRODUCTION_DEPLOY && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('sortdebug') === '1';

const STORAGE_KEY = 'personal-151-favorites-sort-order-v1';

export function initialSortOrder(): SortOrder {
  if (!SORT_DEBUG_ENABLED) return DEFAULT_SORT_ORDER;
  const fromUrl = new URLSearchParams(window.location.search).get('sort');
  const linked = fromUrl == null ? null : parseSortOrder(fromUrl);
  if (linked) return linked;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return (saved == null ? null : parseSortOrder(saved)) ?? DEFAULT_SORT_ORDER;
  } catch {
    return DEFAULT_SORT_ORDER;
  }
}

export function saveSortOrder(order: SortOrder): void {
  const text = formatSortOrder(order);
  try { window.localStorage.setItem(STORAGE_KEY, text); }
  catch { /* Storage can be unavailable in private browsing. */ }
  const url = new URL(window.location.href);
  url.searchParams.set('sort', text);
  url.search = url.searchParams.toString().replace(/%2C/gi, ',');
  window.history.replaceState(window.history.state, '', url);
}
