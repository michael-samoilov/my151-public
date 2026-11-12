import type { BrowserContext } from '@playwright/test';

export const LIVE_HOSTS = ['my151.app', 'www.my151.app'] as const;

const TELEMETRY = /^https:\/\/[^/]+\/api\/(submit|league|favorites|event|feedback|crash|visit)(\?|$)/;

export async function protectLiveSite(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('p151-opt-out', '1');
    } catch {}
  });
  await context.route(TELEMETRY, (route) =>
    route.request().method() === 'GET'
      ? route.continue()
      : route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
  );
}
