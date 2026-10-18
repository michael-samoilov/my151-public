import type { BrowserContext } from '@playwright/test';

/** The hosts whose visits the admin dashboard counts. */
export const LIVE_HOSTS = ['my151.app', 'www.my151.app'] as const;

const TELEMETRY = /^https:\/\/(www\.)?my151\.app\/api\/(submit|league|favorites|event|feedback|crash)(\?|$)/;

/**
 * Keep an automated browser context out of the live site's analytics. Call it
 * before the context opens its first page. It flags the browser as not counted
 * (the `?notme` flag) before any page script runs, and answers telemetry posts
 * in the browser so none reaches the server. Reads, including admin reads,
 * still reach the live site.
 */
export async function protectLiveSite(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('p151-opt-out', '1');
    } catch {
      // Storage can be blocked; the route below still stops every post.
    }
  });
  await context.route(TELEMETRY, (route) =>
    route.request().method() === 'GET'
      ? route.continue()
      : route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
  );
}
