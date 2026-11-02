import { expect, test, type Page } from '@playwright/test';

// Every response waits this long, so a picker tile whose sprite was not
// fetched before the picker opened stays blank for at least this long.
const LATENCY_MS = 250;
const INSTANT_MS = 100;
const WATCH_MS = 4000;

const FAVORITE_WATER = { 'water|1': 7, 'water|2': 158, 'water|3': 258, 'water|4': 393, 'water|5': 501, 'water|6': 656, 'water|7': 728, 'water|8': 816 };

async function seed(page: Page, favorites?: Record<string, number>) {
  await page.addInitScript((favorites) => {
    performance.setResourceTimingBufferSize(5000);
    const cards = Array.from({ length: 14 }, () => ({
      type: null, theme: '', lines: [], signatureSeat: null, tmMoveId: null, badgeName: '', legend: null, powerup: null,
    }));
    localStorage.setItem('league-builder', JSON.stringify({ state: { name: '', cards }, version: 1 }));
    if (favorites) localStorage.setItem('favorite-picker', JSON.stringify({ state: { fills: favorites }, version: 3 }));
  }, favorites);
}

async function slowNetwork(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: LATENCY_MS, downloadThroughput: -1, uploadThroughput: -1 });
}

const spriteRequests = (page: Page) => page.evaluate(() => performance.getEntriesByType('resource')
  .filter((entry) => new URL(entry.name).pathname.startsWith('/sprites/pokemon/')).length);

async function settled(page: Page): Promise<number> {
  let last = -1;
  let since = Date.now();
  await expect.poll(async () => {
    const count = await spriteRequests(page);
    if (count !== last) {
      last = count;
      since = Date.now();
    }
    return Date.now() - since;
  }, { timeout: 60_000, intervals: [250] }).toBeGreaterThan(2000);
  return last;
}

async function chooseType(page: Page, name: string, label = name) {
  await page.locator('button[aria-label^="Gym type"]:visible').first().click();
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.locator(`button[aria-label="Gym type: ${label}"]:visible`)).toHaveCount(1);
}

/** How long each picker tile on screen waited for its sprite after it appeared. */
async function openPicker(page: Page) {
  await page.evaluate((watchMs) => {
    const waits: { sprite: string; waitedMs: number }[] = [];
    const appeared = new Map<HTMLImageElement, number>();
    const start = performance.now();
    (window as unknown as { pickerWaits: typeof waits }).pickerWaits = waits;
    const tick = () => {
      const now = performance.now();
      for (const img of document.querySelectorAll<HTMLImageElement>('[data-testid="verify-evo-card"] img')) {
        if (appeared.has(img) || !new URL(img.src).pathname.startsWith('/sprites/pokemon/')) continue;
        const box = img.getBoundingClientRect();
        if (box.width > 0 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth) appeared.set(img, now);
      }
      for (const [img, at] of appeared) {
        if (at < 0 || !img.complete || img.naturalWidth === 0) continue;
        waits.push({ sprite: new URL(img.src).pathname, waitedMs: Math.round(now - at) });
        appeared.set(img, -1);
      }
      if (now - start < watchMs) {
        requestAnimationFrame(tick);
        return;
      }
      for (const [img, at] of appeared) if (at >= 0) waits.push({ sprite: new URL(img.src).pathname, waitedMs: Math.round(now - at) });
    };
    requestAnimationFrame(tick);
  }, WATCH_MS);
  await page.getByTestId('card-cell-1-1').click();
  await page.waitForTimeout(WATCH_MS + 500);
  return page.evaluate(() => (window as unknown as { pickerWaits: { sprite: string; waitedMs: number }[] }).pickerWaits);
}

test.describe('league picker preload', () => {
  test.use({ serviceWorkers: 'block' });

  test('a gym type loads the picker page before the picker opens', async ({ page }, testInfo) => {
    await seed(page);
    await page.goto('/custom-gym-leader?lang=en&notme');
    await page.getByTestId('league-slot-0').click();
    await page.getByTestId('card-cell-1-1').waitFor();
    await slowNetwork(page);
    const before = await spriteRequests(page);
    await chooseType(page, 'Water');
    const preloaded = (await settled(page)) - before;
    const waits = await openPicker(page);
    const slowest = Math.max(...waits.map((w) => w.waitedMs));
    await testInfo.attach('picker-sprite-waits.json', {
      body: JSON.stringify({ latencyMs: LATENCY_MS, preloaded, tiles: waits.length, slowestMs: slowest, waits }, null, 1),
      contentType: 'application/json',
    });
    expect(waits.length).toBeGreaterThan(0);
    expect(preloaded).toBeGreaterThan(100);
    expect(slowest).toBeLessThanOrEqual(INSTANT_MS);
  });

  test('the preload follows the filters the picker keeps, such as My favorites', async ({ page }, testInfo) => {
    await seed(page, FAVORITE_WATER);
    await page.goto('/custom-gym-leader?lang=en&notme');
    await page.getByTestId('league-slot-0').click();
    await page.getByTestId('card-cell-1-1').waitFor();
    await chooseType(page, 'Fire');
    await page.getByTestId('card-cell-1-1').click();
    await page.getByRole('button', { name: /My favorites/ }).first().click();
    await page.getByTestId('browser-close').click();
    await settled(page);
    await slowNetwork(page);
    const before = await spriteRequests(page);
    await chooseType(page, 'Water');
    const preloaded = (await settled(page)) - before;
    const waits = await openPicker(page);
    const slowest = Math.max(...waits.map((w) => w.waitedMs));
    await testInfo.attach('picker-sprite-waits.json', {
      body: JSON.stringify({ latencyMs: LATENCY_MS, preloaded, tiles: waits.length, slowestMs: slowest, waits }, null, 1),
      contentType: 'application/json',
    });
    expect(waits.length).toBeGreaterThan(0);
    expect(preloaded).toBeGreaterThan(0);
    expect(preloaded).toBeLessThan(60);
    expect(slowest).toBeLessThanOrEqual(INSTANT_MS);
  });

  test('a gym with no type loads the start of the unfiltered picker', async ({ page }, testInfo) => {
    await seed(page);
    await page.goto('/custom-gym-leader?lang=en&notme');
    await page.getByTestId('league-slot-0').waitFor();
    await slowNetwork(page);
    const before = await spriteRequests(page);
    await page.getByTestId('league-slot-0').click();
    await page.getByTestId('card-cell-1-1').waitFor();
    const preloaded = (await settled(page)) - before;
    const waits = await openPicker(page);
    const slowest = Math.max(...waits.map((w) => w.waitedMs));
    await testInfo.attach('picker-sprite-waits.json', {
      body: JSON.stringify({ latencyMs: LATENCY_MS, preloaded, tiles: waits.length, slowestMs: slowest, waits }, null, 1),
      contentType: 'application/json',
    });
    expect(waits.length).toBeGreaterThan(0);
    expect(preloaded).toBeGreaterThan(100);
    expect(preloaded).toBeLessThan(400);
    expect(slowest).toBeLessThanOrEqual(INSTANT_MS);
  });

  test('No type with My favorites on loads only the favorites', async ({ page }, testInfo) => {
    await seed(page, FAVORITE_WATER);
    await page.goto('/custom-gym-leader?lang=en&notme');
    await page.getByTestId('league-slot-0').click();
    await page.getByTestId('card-cell-1-1').waitFor();
    await chooseType(page, 'Fire');
    await page.getByTestId('card-cell-1-1').click();
    await page.getByRole('button', { name: /My favorites/ }).first().click();
    await page.getByTestId('browser-close').click();
    await settled(page);
    await slowNetwork(page);
    const before = await spriteRequests(page);
    await chooseType(page, 'No type', 'no type');
    const preloaded = (await settled(page)) - before;
    const waits = await openPicker(page);
    const slowest = Math.max(...waits.map((w) => w.waitedMs));
    await testInfo.attach('picker-sprite-waits.json', {
      body: JSON.stringify({ latencyMs: LATENCY_MS, preloaded, tiles: waits.length, slowestMs: slowest, waits }, null, 1),
      contentType: 'application/json',
    });
    expect(waits.length).toBeGreaterThan(0);
    expect(preloaded).toBeGreaterThan(0);
    expect(preloaded).toBeLessThan(60);
    expect(slowest).toBeLessThanOrEqual(INSTANT_MS);
  });
});
