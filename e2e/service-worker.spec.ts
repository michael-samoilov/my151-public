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

// The worker caches sprites only. Built files stay with the HTTP cache, and an
// older worker's cache goes on update: WebKit reopens a large worker cache on
// the first request after the app has been idle, before it answers any image.
test('the service worker leaves built files to the HTTP cache and drops the old cache', async ({ page }, testInfo) => {
  await page.goto('/robots.txt');
  await page.evaluate(async () => {
    const old = await caches.open('p151-sprites-v2');
    await old.put('/assets/an-old-deploy.js', new Response('old'));
  });
  await page.goto('/?notme');
  await expect.poll(
    () => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state ?? null),
    { timeout: 15_000 },
  ).toBe('activated');
  await page.reload();
  await page.reload();
  await expect(page.locator('#root h1')).toBeVisible();
  const found = await page.evaluate(async () => Promise.all((await caches.keys()).map(async (name) => ({
    name,
    builtFiles: (await (await caches.open(name)).keys()).filter((request) => new URL(request.url).pathname.startsWith('/assets/')).length,
  }))));
  await testInfo.attach('caches.json', { body: JSON.stringify(found, null, 1), contentType: 'application/json' });
  expect(found.filter((cache) => cache.name === 'p151-sprites-v2' || cache.builtFiles > 0)).toEqual([]);
});
