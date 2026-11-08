import { expect, test, type Page } from './support/test';

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

test('hovering a section moves its picker sprites to the front of the background download', async ({ page }, testInfo) => {
  const requested = recordSprites(page);
  await page.goto('/pokedex-builder?notme');
  const mythical = page.locator('[data-section-id="mythical"]');
  await mythical.hover();
  const before = requested.length;
  await expect.poll(() => requested.includes('151.png'), { timeout: 20_000 }).toBe(true);
  const ahead = requested.indexOf('151.png') - before;
  await testInfo.attach('hover-order.json', { body: JSON.stringify({ requestedBeforeHover: before, requestedBetweenHoverAndMew: ahead, requested }), contentType: 'application/json' });
  expect(ahead).toBeLessThanOrEqual(8);
});
