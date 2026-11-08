import { test, expect, type Page } from './support/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test.setTimeout(60_000);

const preview = (page: Page) => page.locator('[data-export-preview-layer] img[src^="blob:"]');
const save = (page: Page) => page.getByTestId('favorites-export-save');
const stats = (page: Page) => page.getByTestId('favorites-export-stats');

async function imageEvidence(page: Page) {
  await expect(save(page)).toBeEnabled({ timeout: 30000 });
  return preview(page).evaluate(async node => {
    const image = node as HTMLImageElement;
    await image.decode();
    const bytes = await (await fetch(image.src)).arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return { width: image.naturalWidth, height: image.naturalHeight,
      sha256: [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('') };
  });
}

async function seed(page: Page) {
  await page.addInitScript(() => localStorage.setItem('favorite-picker', JSON.stringify({
    state: { fills: { 'fire|1': 4, 'grass|1': 1, 'favorite|1': 4 } }, version: 3,
  })));
}

test('Stats switches in both layouts retain plain bytes and download the selected preview', async ({ page }, testInfo) => {
  await seed(page);
  const exportKinds: unknown[] = [];
  const statsChunks: string[] = [];
  page.on('request', request => {
    if (/\/assets\/renderChartWithStats-[^/]+\.js/.test(request.url())) statsChunks.push(request.url());
  });
  await page.route('**/api/favorites', async route => {
    const body = route.request().postDataJSON();
    if (body.kind === 'export') exportKinds.push({ kind: body.exportKind, stats: body.stats });
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/favorite-pokemon-picker?lang=en');
  const before = await page.evaluate(() => localStorage.getItem('favorite-picker'));
  await page.getByTestId('favorites-export-open').click();
  await expect(stats(page)).not.toBeChecked();
  const plain = await imageEvidence(page);
  const plainUrl = await preview(page).getAttribute('src');
  expect(statsChunks).toEqual([]);
  await stats(page).check();
  const detailed = await imageEvidence(page);
  const detailedUrl = await preview(page).getAttribute('src');
  expect(statsChunks).toHaveLength(1);
  expect(detailed.width).toBeGreaterThan(plain.width);
  expect(detailed.height).toBe(plain.height);
  expect(detailed.sha256).not.toBe(plain.sha256);
  await page.locator('[data-favorites-export-mode="simplified"]').click();
  await expect(stats(page)).toBeChecked();
  const simplifiedDetailed = await imageEvidence(page);
  const simplifiedDetailedUrl = await preview(page).getAttribute('src');
  expect(statsChunks).toHaveLength(1);
  await page.locator('[data-favorites-export-mode="full"]').click();
  await expect(stats(page)).toBeChecked();
  expect(await imageEvidence(page)).toEqual(detailed);
  expect(await preview(page).getAttribute('src')).toBe(detailedUrl);
  await stats(page).uncheck();
  expect(await imageEvidence(page)).toEqual(plain);
  expect(await preview(page).getAttribute('src')).toBe(plainUrl);
  await page.locator('[data-favorites-export-mode="simplified"]').click();
  const simplified = await imageEvidence(page);
  const simplifiedUrl = await preview(page).getAttribute('src');
  expect(simplifiedDetailed.width).toBeGreaterThan(simplified.width);
  expect(simplifiedDetailed.height).toBe(simplified.height);
  await stats(page).check();
  expect(await imageEvidence(page)).toEqual(simplifiedDetailed);
  expect(await preview(page).getAttribute('src')).toBe(simplifiedDetailedUrl);
  await stats(page).uncheck();
  await page.locator('[data-favorites-export-mode="full"]').click();
  await stats(page).check();
  await imageEvidence(page);
  const downloading = page.waitForEvent('download');
  await save(page).click();
  const download = await downloading;
  expect(await download.failure()).toBeNull();
  const bytes = await readFile((await download.path())!);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(detailed.sha256);
  await expect.poll(() => exportKinds).toEqual([{ kind: 'full', stats: true }]);
  await expect(page.locator('[data-export-preview-layer]')).toHaveCount(0);
  expect(await page.evaluate(async urls => Promise.all(urls.map(async url => {
    try { await fetch(url!); return false; } catch { return true; }
  })), [plainUrl, detailedUrl, simplifiedUrl, simplifiedDetailedUrl])).toEqual([true, true, true, true]);
  expect(await page.evaluate(() => localStorage.getItem('favorite-picker'))).toBe(before);
  await testInfo.attach('selected-preview-bytes', { body: JSON.stringify({ plain, detailed, simplified, simplifiedDetailed, exportKinds }, null, 2), contentType: 'application/json' });
});

test('stats checkbox fits and supports keyboard focus in each viewport @viewport', async ({ page }, testInfo) => {
  await page.goto('/favorite-pokemon-picker?lang=de');
  await page.getByTestId('favorites-export-open').click();
  await imageEvidence(page);
  await stats(page).check();
  await expect(page.locator('[role="dialog"][data-export-chrome]')).not.toHaveAttribute('data-sheet-keyboard');
  await stats(page).uncheck();
  await stats(page).focus();
  await expect(stats(page)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(stats(page)).toBeChecked();
  const detailed = await imageEvidence(page);
  const dialog = page.locator('[role="dialog"][data-export-chrome]');
  const bounds = await dialog.boundingBox();
  const control = await stats(page).locator('..').boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(control!.y + control!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
  for (let step = 0; step < 12; step++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  }
  await testInfo.attach('stats-dialog', { body: await page.screenshot(), contentType: 'image/png' });
  await testInfo.attach('stats-fit', { body: JSON.stringify({ bounds, control, viewport, detailed }, null, 2), contentType: 'application/json' });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('favorites-export-open')).toBeFocused();
});

test('stats retry isolates failures from both plain modes and sends no failed export', async ({ page }, testInfo) => {
  const exports: unknown[] = [];
  await page.route('**/api/favorites', async route => {
    const body = route.request().postDataJSON();
    if (body.kind === 'export') exports.push(body);
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/favorite-pokemon-picker?lang=en');
  await page.getByTestId('favorites-export-open').click();
  const plain = await imageEvidence(page);
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      HTMLCanvasElement.prototype.toBlob = original;
      callback(null);
    };
  });
  await stats(page).check();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(save(page)).toBeDisabled();
  await stats(page).uncheck();
  expect(await imageEvidence(page)).toEqual(plain);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.locator('[data-favorites-export-mode="simplified"]').click();
  await imageEvidence(page);
  await page.locator('[data-favorites-export-mode="full"]').click();
  await stats(page).check();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  const recovered = await imageEvidence(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(exports).toEqual([]);
  await testInfo.attach('stats-retry', { body: JSON.stringify({ plain, recovered, failedExports: exports.length }, null, 2), contentType: 'application/json' });
});

test('cancelled stats share keeps selected preview and records no export', async ({ page }, testInfo) => {
  const exports: unknown[] = [];
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15', configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: () => Promise.reject(new DOMException('Cancelled', 'AbortError')), configurable: true });
  });
  await page.route('**/api/favorites', async route => {
    const body = route.request().postDataJSON();
    if (body.kind === 'export') exports.push(body);
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/favorite-pokemon-picker?lang=en');
  await page.getByTestId('favorites-export-open').click();
  await imageEvidence(page);
  await stats(page).check();
  const before = await imageEvidence(page);
  await save(page).click();
  expect(await imageEvidence(page)).toEqual(before);
  await expect(stats(page)).toBeChecked();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(exports).toEqual([]);
  await testInfo.attach('cancelled-stats-share', { body: JSON.stringify({ preview: before, exports: exports.length }, null, 2), contentType: 'application/json' });
});

test('Japanese empty stats use the active localized control', async ({ page }, testInfo) => {
  await page.goto('/favorite-pokemon-picker?lang=ja');
  await page.getByTestId('favorites-export-open').click();
  await imageEvidence(page);
  const label = await stats(page).locator('..').innerText();
  expect(label.trim().length).toBeGreaterThan(0);
  expect(label).not.toContain('Show detailed stats');
  await stats(page).check();
  const image = await imageEvidence(page);
  await testInfo.attach('localized-empty-stats', { body: JSON.stringify({ label, image }, null, 2), contentType: 'application/json' });
});

test('failed stats share records only the later successful retry', async ({ page }, testInfo) => {
  await seed(page);
  const exportKinds: unknown[] = [];
  await page.addInitScript(() => {
    let attempts = 0;
    Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15', configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: () => ++attempts === 1
      ? Promise.reject(new TypeError('Share unavailable')) : Promise.resolve(), configurable: true });
  });
  await page.route('**/api/favorites', async route => {
    const body = route.request().postDataJSON();
    if (body.kind === 'export') exportKinds.push(body.exportKind);
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/favorite-pokemon-picker?lang=en');
  await page.getByTestId('favorites-export-open').click();
  await imageEvidence(page);
  await stats(page).check();
  const before = await imageEvidence(page);
  await save(page).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(exportKinds).toEqual([]);
  await page.getByRole('button', { name: 'Try again' }).click();
  expect(await imageEvidence(page)).toEqual(before);
  await save(page).click();
  await expect.poll(() => exportKinds).toEqual(['full']);
  await expect(page.locator('[data-export-preview-layer]')).toHaveCount(0);
  await testInfo.attach('share-retry-success', { body: JSON.stringify({ preview: before, exportKinds }, null, 2), contentType: 'application/json' });
});
