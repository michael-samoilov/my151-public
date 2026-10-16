import { expect, test, type Browser } from '@playwright/test';

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function visit(browser: Browser, baseURL: string | undefined, seed: Record<string, string>) {
  const context = await browser.newContext({ baseURL, ...PHONE, serviceWorkers: 'block' });
  await context.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, seed);
  const page = await context.newPage();
  const shots: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/shot-151-stats')) shots.push(new URL(request.url()).pathname.split('/').pop()!);
  });
  await page.goto('/pokedex-builder?notme');
  await expect(page.locator('[data-section-id]').first()).toBeVisible();
  await page.waitForTimeout(1500);
  const initiators = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter((entry) => entry.name.includes('/shot-151-stats'))
    .map((entry) => (entry as PerformanceResourceTiming).initiatorType));
  await context.close();
  return { shots, initiators };
}

test('a first visit downloads the intro screenshot once, from the preload', async ({ browser, baseURL }, testInfo) => {
  const seen = await visit(browser, baseURL, {});
  await testInfo.attach('first-visit.json', { body: JSON.stringify(seen), contentType: 'application/json' });
  expect(seen.shots).toHaveLength(1);
  expect(seen.initiators).toEqual(['link']);
});

for (const [name, seed] of [
  ['who dismissed the intro', { 'p151-intro-seen': '1' }],
  ['with a saved Pokédex', { 'personal-151-pokedex-v3': JSON.stringify({ state: { sections: { starter: [1, 4, 7] } }, version: 10 }) }],
] as const) {
  test(`a visitor ${name} downloads no intro screenshot`, async ({ browser, baseURL }) => {
    const seen = await visit(browser, baseURL, seed);
    expect(seen.shots).toEqual([]);
  });
}
