import type { Tool } from '../../api/_events';

export function currentTool(pathname: string = window.location.pathname): Tool {
  if (pathname.startsWith('/custom-gym-leader')) return 'league';
  if (pathname.startsWith('/favorite-pokemon-picker') || pathname.startsWith('/favorite-pokemon-by-type')) return 'favorites';
  if (pathname === '/' || pathname === '/index.html') return 'hub';
  return 'dex';
}

export function currentPage(): string {
  return window.location.pathname;
}
