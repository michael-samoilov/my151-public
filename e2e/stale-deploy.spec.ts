import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';

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
  // platform: Removing a Playwright route at navigation commit can strand the new stylesheet, so the routes stay until the app reloads.
  await expect(page.getByTestId('favorites-export-open')).toBeVisible();
  await page.unrouteAll();
  await expect(crashScreen(page)).toHaveCount(0);
  const after = await saved(page);
  expect(after).toBe(before);

  await page.getByTestId('favorites-export-open').click();
  await expect(page.getByTestId('favorites-export-save')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('favorites-export-save')).toBeEnabled({ timeout: 30_000 });
  const downloading = page.waitForEvent('download');
  await page.getByTestId('favorites-export-save').click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('my151-favorites.png');
  expect(await download.failure()).toBeNull();
  const path = testInfo.outputPath('recovered-favorites.png');
  await download.saveAs(path);
  const png = await readFile(path);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  await testInfo.attach('recovered-favorites', { path, contentType: 'image/png' });
  await artifact(page, testInfo, 'stale-tab-after-deploy', {
    reloaded: true, before, after, picksKept: true, exportOpened: true,
    exportFilename: download.suggestedFilename(), exportBytes: png.byteLength,
  });
});

test('a chunk missing without a deploy shows the error screen, reports it, and does not reload', async ({ page }, testInfo) => {
  const reports: { context: { route: string; error: { where: string; message: string } } }[] = [];
  await page.route('**/api/crash', (route) => {
    reports.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await openStaleTab(page, false);
  let navigations = 0;
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations++; });
  await page.getByTestId('favorites-export-open').click();
  await expect(crashScreen(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-art="psyduck"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send report' })).toHaveCount(0);
  await page.waitForTimeout(1000);
  expect(navigations).toBe(0);
  expect(reports).toHaveLength(1);
  const { route, error } = reports[0].context;
  expect({ route, where: error.where }).toEqual({ route: '/favorite-pokemon-picker', where: 'favorite-picker' });
  expect(error.message).not.toBe('');
  await artifact(page, testInfo, 'missing-chunk-no-deploy', { navigations, crashScreen: true, report: reports[0] });
});
