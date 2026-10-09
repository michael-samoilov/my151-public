import { expect, test, type Page, type TestInfo } from '@playwright/test';

// A deploy removes the previous deploy's hashed chunks, so a tab opened before
// it gets a 404 for the next lazy chunk it loads (src/lib/staleDeploy.ts).
// These tests stage that on one build: the Export chunk answers 404, and the
// page's own HTML, fetched again, carries another build time (a deploy) or
// the same one (no deploy, so a reload would not help).

test.use({ serviceWorkers: 'block' });

const FILLS = { 'fire|1': 6, 'water|1': 9 };
const crashScreen = (page: Page) => page.getByText('This part stopped working');
const saved = (page: Page) => page.evaluate(() => localStorage.getItem('favorite-picker'));

async function openStaleTab(page: Page, deployed: boolean) {
  await page.addInitScript((fills) => {
    if (!localStorage.getItem('favorite-picker')) {
      localStorage.setItem('favorite-picker', JSON.stringify({ state: { fills }, version: 3 }));
    }
  }, FILLS);
  await page.goto('/favorite-pokemon-picker?notme&lang=en');
  await expect(page.getByTestId('favorites-export-open')).toBeVisible();
  await page.route('**/assets/FavoritesExportOverlay-*.js', (route) =>
    route.fulfill({ status: 404, contentType: 'text/html', body: '<!doctype html><title>404</title>' }));
  await page.route((url) => url.pathname === '/favorite-pokemon-picker', async (route) => {
    if (route.request().resourceType() !== 'fetch') return route.continue();
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({ response, body: deployed ? html.replace(/(<meta name="p151-build" content=")[^"]+/, '$1next') : html });
  });
}

async function artifact(page: Page, testInfo: TestInfo, name: string, evidence: unknown) {
  await testInfo.attach(name, { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  await testInfo.attach(`${name}-screen`, { body: await page.screenshot(), contentType: 'image/png' });
}

test('a tab opened before a deploy reloads when it opens Export, keeps the picks, and then exports', async ({ page }, testInfo) => {
  await openStaleTab(page, true);
  const before = await saved(page);
  const reloaded = page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame());
  await page.getByTestId('favorites-export-open').click();
  await reloaded;
  await page.unrouteAll();
  await expect(page.getByTestId('favorites-export-open')).toBeVisible();
  await expect(crashScreen(page)).toHaveCount(0);
  expect(await saved(page)).toBe(before);

  await page.getByTestId('favorites-export-open').click();
  await expect(page.getByTestId('favorites-export-save')).toBeVisible({ timeout: 30_000 });
  await artifact(page, testInfo, 'stale-tab-after-deploy', { reloaded: true, picksKept: true, exportOpened: true });
});

test('a chunk missing without a deploy shows the error screen and does not reload', async ({ page }, testInfo) => {
  await openStaleTab(page, false);
  let navigations = 0;
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations++; });
  await page.getByTestId('favorites-export-open').click();
  await expect(crashScreen(page)).toBeVisible();
  await page.waitForTimeout(1000);
  expect(navigations).toBe(0);
  await artifact(page, testInfo, 'missing-chunk-no-deploy', { navigations, crashScreen: true });
});
