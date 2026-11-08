import { test, expect } from './support/test';
test('new picker route serves its own metadata without JavaScript', async ({ browser, baseURL }, info) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('/favorite-pokemon-picker');
  const metadata = await page.evaluate(() => ({ canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'), robots: document.querySelector('meta[name="robots"]')?.getAttribute('content'), title: document.title, h1: document.querySelector('h1')?.textContent }));
  await info.attach('static-metadata.json', { body: JSON.stringify(metadata), contentType: 'application/json' });
  expect(metadata.canonical).toBe('https://my151.app/favorite-pokemon-picker');
  expect(metadata.robots ?? '').not.toMatch(/noindex|nofollow/);
  expect(metadata.h1).toBe('Favorite Pokémon Picker');
  expect(metadata.title).toBe('Favorite Pokémon Picker by Type and Generation | my151');
  expect(await (await page.request.get('/sitemap.xml')).text()).toContain('/favorite-pokemon-picker');
  const ld = await page.locator('script[type="application/ld+json"]').textContent();
  expect(JSON.parse(ld ?? '{}').url).toBe('https://my151.app/favorite-pokemon-picker');
  await context.close();
});
test('old picker preview links permanently redirect and retain their query', async ({ request }, info) => {
  const response = await request.get('/favorite-pokemon-by-type?lang=de&notme', { maxRedirects: 0 });
  const headers = response.headers();
  await info.attach('redirect.json', { body: JSON.stringify({ status: response.status(), headers }), contentType: 'application/json' });
  expect(response.status()).toBe(308);
  expect(headers.location).toBe('/favorite-pokemon-picker?lang=de&notme');
});
test('new clean route mounts picker instead of SPA hub fallback', async ({ page }, info) => {
  await page.goto('/favorite-pokemon-picker?notme');
  await expect(page.getByTestId('favorites-grid')).toBeVisible();
  await page.getByTestId('favorites-cell-water-1').click();
  await expect(page.getByTestId('favorites-pick-7')).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://my151.app/favorite-pokemon-picker');
  await info.attach('new-route.png', { body: await page.screenshot(), contentType: 'image/png' });
});
