import { expect, test, type Page } from '@playwright/test';

// The picker's 1,388 sprites load in the order a visitor needs them
// (src/favorites/model/spritePreload.ts): Normal / Gen I first, then on a
// desktop nothing more until a cell is hovered, on a touch screen the cells in
// view, and the rest after the first selector. These tests count sprite
// requests to hold that order.

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };

function countSprites(page: Page) {
  const urls = new Set<string>();
  page.on('request', (request) => {
    if (request.url().includes('/sprites/pokemon/')) urls.add(request.url());
  });
  return urls;
}

test('a desktop loads only Normal / Gen I until a cell is hovered, then that cell, and the rest after it opens', async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ baseURL, ...DESKTOP, serviceWorkers: 'block' });
  const page = await context.newPage();
  const sprites = countSprites(page);
  await page.goto('/favorite-pokemon-picker?lang=en');
  const cell = page.getByTestId('favorites-cell-water-1');
  await cell.waitFor();
  await expect.poll(() => sprites.size).toBeGreaterThan(0);
  await page.waitForTimeout(2000);
  const beforeHover = sprites.size;

  await cell.hover();
  await expect.poll(() => sprites.size).toBeGreaterThan(beforeHover);
  const afterHover = sprites.size;

  await cell.click();
  const selector = page.locator('#favorites-selector img[alt]:not([alt=""])');
  await expect(selector.first()).toBeVisible();
  await expect.poll(() => selector.evaluateAll((imgs) => imgs.every((img) => (img as HTMLImageElement).complete))).toBe(true);
  await expect.poll(() => sprites.size, { timeout: 15_000 }).toBeGreaterThan(1000);

  await testInfo.attach('desktop-sprite-requests.json', {
    body: JSON.stringify({ beforeHover, afterHover, afterFirstOpen: sprites.size }),
    contentType: 'application/json',
  });
  // Normal / Gen I alone; the largest cell holds 56 sprites.
  expect(beforeHover).toBeLessThanOrEqual(56);
  expect(afterHover - beforeHover).toBeLessThanOrEqual(56);
  await context.close();
});

test('a touch screen loads the sprites of the cells in view, not all of them, before a tap', async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ baseURL, ...PHONE, serviceWorkers: 'block' });
  const page = await context.newPage();
  const sprites = countSprites(page);
  await page.goto('/favorite-pokemon-picker?lang=en');
  await page.getByTestId('favorites-cell-water-1').waitFor();
  await expect.poll(() => sprites.size).toBeGreaterThan(0);
  await page.waitForTimeout(2000);
  await testInfo.attach('touch-sprite-requests.json', { body: JSON.stringify({ beforeTap: sprites.size }), contentType: 'application/json' });
  expect(sprites.size).toBeLessThan(1000);
  await context.close();
});
