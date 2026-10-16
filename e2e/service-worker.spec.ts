import { expect, test } from '@playwright/test';

for (const path of ['/', '/pokedex-builder', '/favorite-pokemon-picker', '/custom-gym-leader']) {
  test(`a first visit to ${path} registers the service worker`, async ({ page }, testInfo) => {
    await page.goto(`${path}?notme`);
    await expect.poll(
      () => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL ?? null),
      { timeout: 15_000 },
    ).toMatch(/\/sw\.js$/);
    await testInfo.attach('registration', { body: JSON.stringify({ path, registered: true }), contentType: 'application/json' });
  });
}
