import { expect, test } from '@playwright/test';

// Each page registers the service worker that keeps sprites and assets
// (public/sw.js). The picker and the Pokédex start their code after the first
// paint (vite.config.ts), which can be after `load`, so a listener that waited
// for `load` never ran on a first visit. Every page must register on one.

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
