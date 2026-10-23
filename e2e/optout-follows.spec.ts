import { expect, test, type Page } from '@playwright/test';

const DEX_STORE_KEY = 'personal-151-pokedex-v3';
const LEAGUE_STORE_KEY = 'league-builder';
const PICKER_STORE_KEY = 'favorite-picker';

const SEEDED_DEX = JSON.stringify({ state: { sections: { starter: [1] } }, version: 10 });
const SEEDED_LEAGUE = JSON.stringify({
  state: { name: '', cards: [{ type: null, theme: '', lines: [{ branch: [1, 2, 3], boundaries: [1, 3, 5] }], signatureSeat: null, tmMoveId: null, badgeName: '' }] },
  version: 1,
});
const SEEDED_PICKS = JSON.stringify({ state: { fills: { 'fire|1': 4 } }, version: 3 });

const TOOL_PAGES = ['/', '/pokedex-builder', '/custom-gym-leader', '/favorite-pokemon-picker'];

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
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForTimeout(400);
  }
}

test.describe('the owner opt-out follows across pages', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ([dexKey, dexVal, leagueKey, leagueVal, pickerKey, pickerVal]) => {
        if (localStorage.getItem(dexKey) !== null) return;
        localStorage.setItem(dexKey, dexVal);
        localStorage.setItem(leagueKey, leagueVal);
        localStorage.setItem(pickerKey, pickerVal);
      },
      [DEX_STORE_KEY, SEEDED_DEX, LEAGUE_STORE_KEY, SEEDED_LEAGUE, PICKER_STORE_KEY, SEEDED_PICKS] as const,
    );
  });

  test('a normal browser does report from every tool', async ({ page }) => {
    const seen = await countBeacons(page);
    await visitEveryTool(page);
    expect(seen.length).toBeGreaterThan(0);
  });

  for (const entry of TOOL_PAGES) {
    test(`?notme on ${entry} silences every tool`, async ({ page }) => {
      const seen = await countBeacons(page);
      await page.goto(`${entry}?notme`);
      await page.waitForTimeout(800);
      seen.length = 0;

      await visitEveryTool(page);
      expect(seen, `beacons still sent from: ${seen.join(', ')}`).toEqual([]);
    });
  }

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

  test('there is no /notme page', async ({ page }) => {
    const seen = await countBeacons(page);
    await page.goto('/notme');
    await page.waitForTimeout(500);
    await expect(page.getByText('This browser is excluded.')).toHaveCount(0);
    await visitEveryTool(page);
    expect(seen.length, 'the bare path does not opt anyone out').toBeGreaterThan(0);
  });
});
