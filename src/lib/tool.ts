import type { Tool } from '../../api/_events';

/**
 * Which tool this page is, for every beacon the page sends. Read from the
 * path rather than passed around: each tool is its own entry and its own URL,
 * so the path is the fact and a prop would only restate it.
 */
export function currentTool(pathname: string = window.location.pathname): Tool {
  if (pathname.startsWith('/custom-gym-leader')) return 'league';
  if (pathname.startsWith('/favorite-pokemon-by-type')) return 'favorites';
  if (pathname === '/' || pathname === '/index.html') return 'hub';
  return 'dex';
}

export function currentPage(): string {
  return window.location.pathname;
}
