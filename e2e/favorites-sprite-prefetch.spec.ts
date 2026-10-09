import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// The picker's 1,391 sprites load in the order a visitor needs them
// (src/favorites/model/spritePreload.ts): Normal / Gen I first, then in the
// desktop layout nothing more until a cell is hovered or pressed, in the phone
// layout the cells in view, and the rest after the first selector. The build
// delivers them in packs (src/favorites/model/spritePacks.ts): bulk packs for
// that order, and a cell's own pack for a cell opened before its bulk pack. A
// pack that fails falls back to single files. These tests count the requests
// that reach the server, by kind, to hold that order.

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };

interface Requests { bulk: string[]; cells: string[]; files: string[]; firstBulkCount: Promise<number> | null }

/**
 * Requests that reach the server, by kind. A request the service worker
 * answers from its cache does not count; one it passes to the network does.
 */
function countRequests(target: Page | BrowserContext): Requests {
  const seen: Requests = { bulk: [], cells: [], files: [], firstBulkCount: null };
  let firstBulk: string | null = null;
  target.on('request', (request) => {
    if (request.url().includes('/sprites/packs/picker-sprites-')) firstBulk ??= request.url();
  });
  target.on('requestfinished', async (request) => {
    // A request can finish after its page closes.
    const response = await request.response().catch(() => null);
    if (!response || response.fromServiceWorker()) return;
    const url = request.url();
    if (url.includes('/sprites/packs/picker-sprites-')) {
      seen.bulk.push(url);
      // A pack starts with its sprite count (src/favorites/model/spritePacks.ts).
      if (url === firstBulk) seen.firstBulkCount = response.body().then((body) => body.readUInt32LE(0));
    } else if (url.includes('/sprites/packs/picker-cell-')) seen.cells.push(url);
    else if (url.includes('/sprites/pokemon/')) seen.files.push(url);
  });
  return seen;
}

const counts = (r: Requests) => ({ bulk: r.bulk.length, cells: r.cells.length, files: r.files.length });

/** Every sprite in the open selector is drawn: none waits on a pack or a file. */
async function expectSelectorDrawn(page: Page) {
  const sprites = page.locator('#favorites-selector [data-testid^="favorites-pick-"] img[alt]:not([alt=""])');
  await expect(sprites.first()).toBeVisible();
  await expect.poll(() => sprites.evaluateAll((imgs) => imgs.every((img) => {
    const image = img as HTMLImageElement;
    return image.complete && image.naturalWidth > 1;
  })), { timeout: 15_000 }).toBe(true);
  return sprites.count();
}

test('a desktop loads only Normal / Gen I until a cell is hovered, then that cell, and the rest after it opens', async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ baseURL, ...DESKTOP, serviceWorkers: 'block' });
  const page = await context.newPage();
  const requests = countRequests(page);
  await page.goto('/favorite-pokemon-picker?lang=en');
  await page.getByTestId('favorites-cell-water-1').waitFor();
  await expect.poll(() => requests.bulk.length).toBeGreaterThan(0);
  await page.waitForTimeout(2000);
  const beforeHover = counts(requests);

  // The first pack holds Normal / Gen I, so that cell needs nothing more.
  await page.getByTestId('favorites-cell-normal-1').hover();
  await page.waitForTimeout(500);
  const afterFirstCell = counts(requests);

  await page.getByTestId('favorites-cell-water-1').hover();
  await expect.poll(() => requests.cells.length).toBeGreaterThan(0);
  const afterHover = counts(requests);

  await page.getByTestId('favorites-cell-water-1').click();
  await expectSelectorDrawn(page);
  await expect.poll(() => requests.bulk.length).toBeGreaterThan(1);
  await page.waitForLoadState('networkidle');
  const afterFirstOpen = counts(requests);

  await testInfo.attach('desktop-sprite-requests.json', {
    body: JSON.stringify({ beforeHover, afterFirstCell, afterHover, afterFirstOpen }),
    contentType: 'application/json',
  });
  expect(beforeHover).toEqual({ bulk: 1, cells: 0, files: 0 });
  expect(afterFirstCell).toEqual(beforeHover);
  expect(afterHover).toEqual({ bulk: 1, cells: 1, files: 0 });
  expect(afterFirstOpen.files).toBe(0);
  expect(afterFirstOpen.bulk + afterFirstOpen.cells).toBeLessThanOrEqual(20);
  await context.close();
});

test('a touch screen at desktop width loads only Normal / Gen I before a tap', async ({ browser, baseURL }, testInfo) => {
  // A tablet in landscape, or a headless desktop browser with no hover: the
  // desktop layout shows nearly every cell, so in-view loading would fetch
  // them all.
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  const requests = countRequests(page);
  await page.goto('/favorite-pokemon-picker?lang=en');
  await page.getByTestId('favorites-cell-water-1').waitFor();
  await expect.poll(() => requests.bulk.length).toBeGreaterThan(0);
  await page.waitForTimeout(2000);
  await testInfo.attach('wide-touch-sprite-requests.json', { body: JSON.stringify({ beforeTap: counts(requests) }), contentType: 'application/json' });
  expect(counts(requests)).toEqual({ bulk: 1, cells: 0, files: 0 });
  await context.close();
});

test('a touch screen loads Normal / Gen I first, then the packs of the cells in view, before a tap', async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ baseURL, ...PHONE, serviceWorkers: 'block' });
  const page = await context.newPage();
  const requests = countRequests(page);
  await page.goto('/favorite-pokemon-picker?lang=en');
  await page.getByTestId('favorites-cell-water-1').waitFor();
  await expect.poll(() => requests.bulk.length).toBeGreaterThan(1);
  await page.waitForLoadState('networkidle');
  const beforeTap = counts(requests);
  const firstPackSprites = await requests.firstBulkCount;

  await page.getByTestId('favorites-cell-normal-1').tap();
  const firstCellSprites = await expectSelectorDrawn(page);

  await testInfo.attach('touch-sprite-requests.json', { body: JSON.stringify({ beforeTap, firstPackSprites, firstCellSprites }), contentType: 'application/json' });
  expect(firstPackSprites).toBe(firstCellSprites);
  expect(beforeTap.cells).toBe(0);
  expect(beforeTap.files).toBe(0);
  await context.close();
});

test('when the packs fail, a selector fills from single files', async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ baseURL, ...DESKTOP, serviceWorkers: 'block' });
  await context.route('**/sprites/packs/**', (route) => route.abort());
  const page = await context.newPage();
  const requests = countRequests(page);
  await page.goto('/favorite-pokemon-picker?lang=en');
  await page.getByTestId('favorites-cell-water-1').click();
  const drawn = await expectSelectorDrawn(page);
  await testInfo.attach('failed-pack-requests.json', { body: JSON.stringify({ drawn, ...counts(requests) }), contentType: 'application/json' });
  expect(requests.files.length).toBeGreaterThanOrEqual(drawn);
  await context.close();
});

test('a returning visitor’s picks draw from the service worker, with no request', async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ baseURL, ...DESKTOP });
  const page = await context.newPage();
  await page.goto('/favorite-pokemon-picker?lang=en');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.getByTestId('favorites-cell-water-1').click();
  await expectSelectorDrawn(page);
  const pick = page.locator('#favorites-selector [data-testid^="favorites-pick-"]').first();
  const name = await pick.locator('img[alt]:not([alt=""])').getAttribute('alt');
  await pick.click();
  const sprite = page.getByTestId('favorites-cell-water-1').locator('img[alt]:not([alt=""])');
  await expect(sprite).toHaveAttribute('alt', name!);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).length)).toBeGreaterThan(0);
  await page.waitForTimeout(500);

  const requests = countRequests(context);
  const again = await context.newPage();
  await again.goto('/favorite-pokemon-picker?lang=en');
  const returned = again.getByTestId('favorites-cell-water-1').locator('img[alt]:not([alt=""])');
  await expect(returned).toHaveAttribute('alt', name!);
  await expect.poll(() => returned.evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 1)).toBe(true);
  await again.waitForTimeout(1000);
  await testInfo.attach('returning-visit-requests.json', { body: JSON.stringify(counts(requests)), contentType: 'application/json' });
  expect(requests.files).toEqual([]);
  await context.close();
});
