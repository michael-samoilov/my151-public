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

// The worker keeps sprites in IndexedDB and leaves built files to the HTTP
// cache. WebKit reopens Cache Storage on the first request after the app has
// been idle, at a cost that grows with every entry, so an older worker's caches
// go on update and nothing is cached there again.
test('the service worker keeps sprites in IndexedDB, and nothing in Cache Storage', async ({ page }, testInfo) => {
  await page.goto('/robots.txt');
  await page.evaluate(async () => {
    const old = await caches.open('p151-sprites-v3');
    await old.put('/sprites/pokemon/25.png', new Response('old'));
  });
  await page.goto('/favorite-pokemon-picker?notme');
  await expect.poll(
    () => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state ?? null),
    { timeout: 15_000 },
  ).toBe('activated');
  await page.reload();
  await page.reload();
  await expect(page.locator('img[src*="/sprites/"]').first()).toBeVisible();
  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('p151-sprites');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const keys = !db.objectStoreNames.contains('sprites') ? [] : await new Promise<IDBValidKey[]>((resolve, reject) => {
      const request = db.transaction('sprites').objectStore('sprites').getAllKeys();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return { caches: await caches.keys(), paths: keys.map((key) => new URL(String(key)).pathname) };
  });
  await testInfo.attach('sprite-storage.json', { body: JSON.stringify(stored, null, 1), contentType: 'application/json' });
  expect(stored.caches).toEqual([]);
  expect(stored.paths.length).toBeGreaterThan(0);
  expect(stored.paths.filter((path) => !path.startsWith('/sprites/') && path !== '/favicon.svg' && path !== '/icons.svg')).toEqual([]);
});
