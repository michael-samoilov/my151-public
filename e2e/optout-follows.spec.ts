import { expect, test, type Page } from '@playwright/test';

/**
 * The owner opt-out has to hold on every page of the site, not just the one it
 * was set on.
 *
 * It is stored in localStorage, which is scoped to the origin rather than the
 * path, so one `?notme` on any page should cover the hub, the dex builder, the
 * gym leader maker and the picker together. "Should" is the problem: the failure is
 * silent. A broken opt-out looks exactly like a working one until the owner's
 * own sessions turn up in the dashboard weeks later, mixed into every number.
 * `?notme` already did nothing at all on the gym leader maker once, for
 * exactly this reason.
 *
 * Method: count every request the app makes to an analytics endpoint while
 * loading all four tools. The first test proves the counter can see beacons
 * at all — without it, a spec that asserts "zero" passes against an app that
 * is simply broken.
 */

const DEX_STORE_KEY = 'personal-151-pokedex-v3';
const LEAGUE_STORE_KEY = 'league-builder';
const PICKER_STORE_KEY = 'favorite-picker';

// A placed Pokemon and a seated line, so the build beacons have something to
// report and the load-time funnel events are not the only signal.
const SEEDED_DEX = JSON.stringify({ state: { sections: { starter: [1] } }, version: 10 });
const SEEDED_LEAGUE = JSON.stringify({
  state: { name: '', cards: [{ type: null, theme: '', lines: [{ branch: [1, 2, 3], boundaries: [1, 3, 5] }], signatureSeat: null, tmMoveId: null, badgeName: '' }] },
  version: 1,
});
const SEEDED_PICKS = JSON.stringify({ state: { fills: { 'fire|1': 4 } }, version: 3 });

const TOOL_PAGES = ['/', '/pokedex-builder', '/custom-gym-leader', '/favorite-pokemon-picker'];

/** Every analytics request the page makes, by endpoint. */
async function countBeacons(page: Page): Promise<string[]> {
  const seen: string[] = [];
  for (const path of ['submit', 'league', 'event', 'favorites']) {
    await page.route(`**/api/${path}`, async (route) => {
      seen.push(path);
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
  }
  return seen;
}

/**
 * Load each tool and let it report.
 *
 * The flush has to be dispatched on `window`: that is where the beacon
 * scheduler listens, and a plain `new Event('pagehide')` does not bubble, so
 * dispatching it on `document` reaches nothing. With the wrong target this
 * helper silently never flushed a build beacon, and the spec was only ever
 * watching the funnel events — which are once-per-browser, so whichever page
 * set the flag consumed its own and left nothing to detect.
 */
async function visitEveryTool(page: Page): Promise<void> {
  for (const path of TOOL_PAGES) {
    await page.goto(path);
    // The build beacon is debounced; back-grounding flushes anything pending,
    // which is what a real person leaving a page does.
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForTimeout(400);
  }
}

test.describe('the owner opt-out follows across pages', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ([dexKey, dexVal, leagueKey, leagueVal, pickerKey, pickerVal]) => {
        // Seed once: a reload must keep what the page saved, as a real visit does.
        if (localStorage.getItem(dexKey) !== null) return;
        localStorage.setItem(dexKey, dexVal);
        localStorage.setItem(leagueKey, leagueVal);
        localStorage.setItem(pickerKey, pickerVal);
      },
      [DEX_STORE_KEY, SEEDED_DEX, LEAGUE_STORE_KEY, SEEDED_LEAGUE, PICKER_STORE_KEY, SEEDED_PICKS] as const,
    );
  });

  // Without this, "zero beacons" would also pass against an app that sends
  // none at all — which is the same evidence, and the wrong conclusion.
  test('a normal browser does report from every tool', async ({ page }) => {
    const seen = await countBeacons(page);
    await visitEveryTool(page);
    expect(seen.length).toBeGreaterThan(0);
  });

  // One flag, set on any one page, has to hold on the other two. The flag is
  // set per origin, so each of these is the same localStorage key reached from
  // a different entry point — and each entry has to call installOptOut for it.
  for (const entry of TOOL_PAGES) {
    test(`?notme on ${entry} silences every tool`, async ({ page }) => {
      const seen = await countBeacons(page);
      await page.goto(`${entry}?notme`);
      await page.waitForTimeout(800);
      // Whatever that first page sent before the flag landed is not the
      // subject; the question is what every tool sends afterwards.
      seen.length = 0;

      await visitEveryTool(page);
      expect(seen, `beacons still sent from: ${seen.join(', ')}`).toEqual([]);
    });
  }

  // The owner's way back to being counted, for testing as a normal visitor.
  // Clearing site data also clears the flag, but it deletes saved selections.
  test('?countme counts a flagged browser again and keeps its saved data', async ({ page }, testInfo) => {
    const seen = await countBeacons(page);
    await page.goto('/?notme');
    await page.waitForTimeout(800);
    seen.length = 0;

    await page.goto('/favorite-pokemon-picker?countme');
    await page.waitForTimeout(800);
    seen.length = 0;
    await visitEveryTool(page);
    const after = await page.evaluate((keys) => ({
      flag: localStorage.getItem('p151-opt-out'),
      saved: keys.map((key) => localStorage.getItem(key) !== null),
      fills: JSON.parse(localStorage.getItem('favorite-picker') ?? 'null')?.state?.fills,
    }), [DEX_STORE_KEY, LEAGUE_STORE_KEY, PICKER_STORE_KEY]);
    const evidence = { endpoints: [...new Set(seen)].sort(), ...after };
    await testInfo.attach('countme.json', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });

    expect(evidence.flag).toBeNull();
    expect(evidence.endpoints).toEqual(expect.arrayContaining(['event', 'favorites', 'league', 'submit']));
    expect(evidence.saved).toEqual([true, true, true]);
    expect(evidence.fills).toEqual({ 'fire|1': 4 });
  });

  // There is no page and nothing in the UI: the flag is the owner's switch,
  // and a discoverable page would invite anyone to erase themselves from the
  // analytics.
  test('there is no /notme page', async ({ page }) => {
    const seen = await countBeacons(page);
    await page.goto('/notme');
    await page.waitForTimeout(500);
    await expect(page.getByText('This browser is excluded.')).toHaveCount(0);
    // The path alone must not flag the browser either.
    await visitEveryTool(page);
    expect(seen.length, 'the bare path does not opt anyone out').toBeGreaterThan(0);
  });
});
