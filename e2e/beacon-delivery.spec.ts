import { expect, test } from '@playwright/test';

/**
 * Regression harness for lost analytics sessions.
 *
 * The progress beacon is debounced: it fires a few seconds after the last
 * edit. The way a phone session ends — swipe away, switch apps — lands inside
 * that window, and for months the pending beacon died with the page. A short
 * first visit lost every beacon: the person never existed in the dashboard.
 * ("My friend used the app and doesn't show up.")
 *
 * The fix delivers the pending beacon from visibilitychange→hidden and
 * pagehide, via fetch keepalive. These tests pin that behaviour.
 *
 * Method: virtual time is installed and never advanced, so the debounce timer
 * cannot fire on its own. Any beacon that arrives after backgrounding was sent
 * by the lifecycle flush — the thing under test — not by the timer racing the
 * assertion. The third test advances the clock instead, proving the ordinary
 * debounce path still delivers for users who simply linger.
 */

const STORE_KEY = 'personal-151-pokedex-v3';
const CID = 'e2e-beacon-cid-00000001';

// One placed Pokemon, persisted the way the store persists it — the app mounts
// with a non-empty build, so the beacon hook schedules a progress report.
const SEEDED_STORE = JSON.stringify({ state: { sections: { starter: [1] } }, version: 10 });

type Beacon = { kind?: string; cid?: string; ids?: number[] };

test.describe('beacon delivery', () => {
  let posts: Beacon[];

  test.beforeEach(async ({ page }) => {
    posts = [];
    await page.route('**/api/submit', async (route) => {
      posts.push(route.request().postDataJSON() as Beacon);
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    // Funnel events are not under test; answer them so the preview server
    // (which has no API) doesn't fill the console with 404s.
    await page.route('**/api/event', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    );
    await page.addInitScript(
      ([key, value, cid]) => {
        localStorage.setItem(key, value);
        localStorage.setItem('p151-cid', cid);
      },
      [STORE_KEY, SEEDED_STORE, CID] as const,
    );
    // Freeze virtual time BEFORE navigating. `install()` alone keeps ticking in
    // real time, which lets the debounce fire behind the assertions — the flush
    // tests then pass against unfixed code (verified: the pre-fix build passed
    // them). Pausing after load instead races page startup: on a slow project
    // the clock has already run past the runner's `Date.now()`, and pauseAt
    // rejects as "cannot fast-forward to the past". Paused from the start, no
    // timer can fire until a test advances it, so a delivered beacon can only
    // have come from an explicit flush.
    //
    // Pause a second past the install time, not at it. The installed clock can
    // tick before `pauseAt` lands, and pausing at the install time itself then
    // fails the same way (6 of 75 runs under load). No page has loaded yet, so
    // jumping the second fires no timer.
    const T0 = new Date('2026-08-18T12:00:00Z').getTime();
    await page.clock.install({ time: T0 });
    await page.clock.pauseAt(T0 + 1000);
    await page.goto('/pokedex-builder');
    await expect(page.locator('[data-build-scroll]')).toBeVisible();
  });

  test('backgrounding the page flushes the pending progress beacon', async ({ page }) => {
    expect(posts, 'virtual time is frozen, so nothing may have fired yet').toEqual([]);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => posts.length, { timeout: 5000 }).toBeGreaterThan(0);
    expect(posts[0].kind).toBe('progress');
    expect(posts[0].cid).toBe(CID);
    expect(posts[0].ids).toEqual([1]);
  });

  test('pagehide flushes the pending progress beacon', async ({ page }) => {
    expect(posts).toEqual([]);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await expect.poll(() => posts.length, { timeout: 5000 }).toBeGreaterThan(0);
    expect(posts[0].kind).toBe('progress');
    expect(posts[0].cid).toBe(CID);
  });

  test('the debounce still delivers on its own when the user lingers', async ({ page }) => {
    expect(posts).toEqual([]);
    await page.clock.runFor(4000);
    await expect.poll(() => posts.length, { timeout: 5000 }).toBeGreaterThan(0);
    expect(posts[0].kind).toBe('progress');
  });
});
