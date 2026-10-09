/**
 * The deploy's build time. The browser reads it from the page's
 * `<meta name="p151-build">` (vite.config.ts), not from a constant in the
 * JavaScript: a value that changes on every deploy gave most chunks a new
 * file name on every deploy, even when their code had not changed. Only the
 * hub's prerender, which has no document, reads the constant.
 */
declare const __BUILD_TIMESTAMP__: string;

export const BUILD_TIMESTAMP: string = import.meta.env.SSR
  ? __BUILD_TIMESTAMP__
  : typeof document === 'undefined'
    ? ''
    : document.querySelector('meta[name="p151-build"]')?.getAttribute('content') ?? '';
