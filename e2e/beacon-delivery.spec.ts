import { expect, test } from '@playwright/test';

const STORE_KEY = 'personal-151-pokedex-v3';
const CID = 'e2e-beacon-cid-00000001';

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
