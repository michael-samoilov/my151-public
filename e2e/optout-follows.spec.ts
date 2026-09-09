import { expect, test, type Page } from '@playwright/test';

/**
 * The owner opt-out has to hold on every page of the site, not just the one it
 * was set on.
 *
 * It is stored in localStorage, which is scoped to the origin rather than the
 * path, so one visit should cover the hub, the dex builder and the gym leader
 * maker together. "Should" is the problem: the failure is silent. A broken
 * opt-out looks exactly like a working one until the owner's own sessions turn
 * up in the dashboard weeks later, mixed into every number. `?notme` already
 * did nothing at all on the gym leader maker once, for exactly this reason.
 *
 * Method: count every request the app makes to an analytics endpoint while
 * loading all three tools. The first test proves the counter can see beacons
 * at all — without it, a spec that asserts "zero" passes against an app that
 * is simply broken.
 */

const DEX_STORE_KEY = 'personal-151-pokedex-v3';
const LEAGUE_STORE_KEY = 'league-builder';

// A placed Pokemon and a seated line, so the build beacons have something to
// report and the load-time funnel events are not the only signal.
const SEEDED_DEX = JSON.stringify({ state: { sections: { starter: [1] } }, version: 10 });
const SEEDED_LEAGUE = JSON.stringify({
  state: { name: '', cards: [{ type: null, theme: '', lines: [{ branch: [1, 2, 3], boundaries: [1, 3, 5] }], signatureSeat: null, tmMoveId: null, badgeName: '' }] },
  version: 1,
});

/** Every analytics request the page makes, by endpoint. */
async function countBeacons(page: Page): Promise<string[]> {
  const seen: string[] = [];
  for (const path of ['submit', 'league', 'event']) {
    await page.route(`**/api/${path}`, async (route) => {
      seen.push(path);
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
  }
  return seen;
}

/** Load each tool and give the debounced build beacon time to arrive. */
async function visitEveryTool(page: Page): Promise<void> {
  for (const path of ['/', '/pokedex-builder', '/custom-gym-leader']) {
    await page.goto(path);
    // The build beacon is debounced; back-grounding flushes anything pending,
    // which is what a real person leaving a page does.
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.dispatchEvent(new Event('pagehide')));
  }
}

test.describe('the owner opt-out follows across pages', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ([dexKey, dexVal, leagueKey, leagueVal]) => {
        localStorage.setItem(dexKey, dexVal);
        localStorage.setItem(leagueKey, leagueVal);
      },
      [DEX_STORE_KEY, SEEDED_DEX, LEAGUE_STORE_KEY, SEEDED_LEAGUE] as const,
    );
  });

  // Without this, "zero beacons" would also pass against an app that sends
  // none at all — which is the same evidence, and the wrong conclusion.
  test('a normal browser does report from every tool', async ({ page }) => {
    const seen = await countBeacons(page);
    await visitEveryTool(page);
    expect(seen.length).toBeGreaterThan(0);
  });

  test('one visit to /notme silences every tool', async ({ page }) => {
    const seen = await countBeacons(page);

    await page.goto('/notme');
    await expect(page.getByText('This browser is excluded.')).toBeVisible();
    // The switch page must not report on itself either.
    expect(seen).toEqual([]);

    await visitEveryTool(page);
    expect(seen, `beacons still sent from: ${seen.join(', ')}`).toEqual([]);
  });

  test('the ?notme flag on any single page silences the others', async ({ page }) => {
    const seen = await countBeacons(page);
    // Set it on the gym leader maker — the page the flag once did nothing on.
    await page.goto('/custom-gym-leader?notme');
    await page.waitForTimeout(500);
    seen.length = 0;

    await visitEveryTool(page);
    expect(seen, `beacons still sent from: ${seen.join(', ')}`).toEqual([]);
  });

  test('the page can let the browser back in', async ({ page }) => {
    await page.goto('/notme');
    await expect(page.getByText('This browser is excluded.')).toBeVisible();

    await page.getByRole('button', { name: 'Count this browser again' }).click();
    await expect(page.getByText(/counted like anyone else/)).toBeVisible();

    const seen = await countBeacons(page);
    await visitEveryTool(page);
    expect(seen.length).toBeGreaterThan(0);
  });
});
