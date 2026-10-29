import { expect, test, type Page } from '@playwright/test';

const SPRITES = '/sprites/pokemon/';

function recordSprites(page: Page): string[] {
  const requested: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith(SPRITES)) requested.push(pathname.slice(SPRITES.length));
  });
  return requested;
}

test('a first visit downloads the starter pickers\' sprites in the background', async ({ page }, testInfo) => {
  const requested = recordSprites(page);
  await page.goto('/pokedex-builder?notme');
  await expect(page.locator('[data-section-id]').first()).toBeVisible();
  // Bulbasaur, Charmander and Squirtle head the grass, fire and water starter pickers.
  await expect.poll(() => ['1.png', '4.png', '7.png'].filter((file) => requested.includes(file)), { timeout: 20_000 })
    .toEqual(['1.png', '4.png', '7.png']);
  await testInfo.attach('warmed-sprites.json', { body: JSON.stringify(requested), contentType: 'application/json' });
});

test('Data Saver turns the background sprite download off', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
  });
  const requested = recordSprites(page);
  await page.goto('/pokedex-builder?notme');
  await expect(page.locator('[data-section-id]').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5_000);
  await testInfo.attach('data-saver-sprites.json', { body: JSON.stringify(requested), contentType: 'application/json' });
  expect(requested).toEqual([]);
});
