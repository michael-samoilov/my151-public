/**
 * A deploy renames most of the hashed files under /assets, and the host
 * serves only the newest deploy. A tab opened before a deploy then gets a 404
 * for the first lazy chunk it asks for after it: Export, the Analytics tab, a
 * drill-down, an export renderer. That rejection reached the error boundary,
 * which replaced the page with "This part stopped working" (October 9, 2026:
 * twice in one 30-minute Picker session, on a day with several deploys).
 *
 * Reload instead, but only when the server's copy of this page loads another
 * entry script, which proves a newer deploy. Saved work lives in
 * localStorage, so the reload keeps it. When the check fails (offline) or
 * finds the same entry (a real bug), the error goes on as before.
 */

const ENTRY = /<script type="module"[^>]*\ssrc="([^"]+)"/;
const RELOADED_AT = 'p151-stale-deploy-reload';
let check: Promise<boolean> | null = null;

async function newerDeployIsLive(): Promise<boolean> {
  const current = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src;
  if (!current) return false;
  try {
    const response = await fetch(window.location.href, { cache: 'no-store' });
    if (!response.ok) return false;
    const next = ENTRY.exec(await response.text())?.[1];
    return next !== undefined && new URL(next, window.location.href).href !== current;
  } catch {
    return false;
  }
}

/** At most one reload per 30 s, in case the server ever disagrees with itself. */
function mayReload(): boolean {
  try {
    if (Date.now() - Number(sessionStorage.getItem(RELOADED_AT)) < 30_000) return false;
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch { /* Storage can be off; the entry check alone still ends a loop. */ }
  return true;
}

/**
 * Resolves true when it has started a reload. Failures share one check; after
 * a false result the next failure checks again, as the network may be back.
 */
function reloadForNewerDeploy(): Promise<boolean> {
  check ??= newerDeployIsLive().then((newer) => {
    if (newer && mayReload()) {
      window.location.reload();
      return true;
    }
    check = null;
    return false;
  });
  return check;
}

/**
 * Wraps a `lazy()` import. When a newer deploy removed the chunk, the promise
 * never settles and the page reloads, so Suspense keeps its fallback on screen
 * instead of the error boundary.
 */
export function reloadIfStale<T>(load: Promise<T>): Promise<T> {
  return load.catch(async (error: unknown) => {
    if (await reloadForNewerDeploy()) return new Promise<T>(() => {});
    throw error;
  });
}

/** Every other dynamic import, through the event Vite raises when one fails. */
export function installStaleDeployReload(): void {
  window.addEventListener('vite:preloadError', () => { void reloadForNewerDeploy(); });
}
