const BUILD = /<meta name="p151-build" content="([^"]+)"/;
const RELOADED_AT = 'p151-stale-deploy-reload';
let check: Promise<boolean> | null = null;

async function newerDeployIsLive(): Promise<boolean> {
  const current = document.querySelector('meta[name="p151-build"]')?.getAttribute('content');
  if (!current) return false;
  try {
    const response = await fetch(window.location.href, { cache: 'no-store' });
    if (!response.ok) return false;
    const next = BUILD.exec(await response.text())?.[1];
    return next !== undefined && next !== current;
  } catch {
    return false;
  }
}

function mayReload(): boolean {
  try {
    if (Date.now() - Number(sessionStorage.getItem(RELOADED_AT)) < 30_000) return false;
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch { return true; }
  return true;
}

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

export function reloadIfStale<T>(load: Promise<T>): Promise<T> {
  return load.catch(async (error: unknown) => {
    if (await reloadForNewerDeploy()) return new Promise<T>(() => {});
    throw error;
  });
}

export function installStaleDeployReload(): void {
  window.addEventListener('vite:preloadError', () => { void reloadForNewerDeploy(); });
}
