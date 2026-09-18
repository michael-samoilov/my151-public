import { expect, test, type Page } from '@playwright/test';
import { seedDex, TUNE_URL } from './support/dexSeed';

const MOBILE = { width: 390, height: 844 } as const;

async function openDexExport(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => false });
  });
  await page.goto(TUNE_URL);
  await seedDex(page);
  await page.locator('[data-nav="view"]').click();
  await page.getByRole('button', { name: 'View settings' }).waitFor();
  const exportBtn = page.locator('[data-dex-export], [data-testid="tool-actions"] button:not([aria-label="View settings"])').first();
  await exportBtn.click();
}

async function waitPreviewReady(page: Page) {
  const confirm = page.locator('[data-dex-export-confirm]');
  await expect(confirm).toBeEnabled({ timeout: 45_000 });
  const img = page.locator('[data-export-preview-layer] img');
  await img.waitFor({ timeout: 45_000 });
  await img.evaluate((el: HTMLImageElement) => {
    if (el.complete && el.naturalWidth > 0) return;
    return new Promise<void>((resolve, reject) => {
      el.addEventListener('load', () => resolve(), { once: true });
      el.addEventListener('error', () => reject(new Error('preview image failed')), { once: true });
    });
  });
}

async function parkPreview(page: Page) {
  const foil = page.locator('[data-export-preview]');
  if ((await foil.getAttribute('data-paused')) === '1') return;
  const box = await page.locator('[data-export-tilt-hit]').boundingBox();
  if (!box) return;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(async () => foil.getAttribute('data-paused')).toBe('1');
  await page.waitForTimeout(450);
}

function previewFitsBand(page: Page, viewportHeight: number) {
  return page.evaluate((vh) => {
    const img = document.querySelector<HTMLElement>('[data-export-preview-layer] img');
    const layer = document.querySelector<HTMLElement>('[data-export-preview-layer]');
    const sheet = document.querySelector<HTMLElement>('[data-export-chrome]');
    if (!img || !layer) return { ok: false, reason: 'missing preview' };
    const i = img.getBoundingClientRect();
    const l = layer.getBoundingClientRect();
    const s = sheet?.getBoundingClientRect();
    const pad = 2;
    if (i.left < l.left - pad) return { ok: false, reason: `left ${i.left} < ${l.left}` };
    if (i.right > l.right + pad) return { ok: false, reason: `right ${i.right} > ${l.right}` };
    if (i.top < l.top - pad) return { ok: false, reason: `top ${i.top} < ${l.top}` };
    if (i.bottom > l.bottom + pad) return { ok: false, reason: `bottom ${i.bottom} > ${l.bottom}` };
    const gutter = Math.min(i.left - l.left, l.right - i.right, i.top - l.top, l.bottom - i.bottom);
    if (gutter < 16) return { ok: false, reason: `tight gutter ${gutter}` };
    if (s && i.bottom > s.top + pad) return { ok: false, reason: `img under sheet ${i.bottom} > ${s.top}` };
    if (i.height < 80) return { ok: false, reason: `tiny img ${i.height}` };
    if (s && s.height > Math.round(vh * 0.45) + 8) {
      return { ok: false, reason: `sheet too tall ${s.height}` };
    }
    return { ok: true, reason: '' };
  }, viewportHeight);
}

test.describe('dex export overlay', () => {
  test('opens a live preview instead of downloading immediately', async ({ page }) => {
    const downloads: string[] = [];
    page.on('download', (d) => downloads.push(d.suggestedFilename()));
    await openDexExport(page);

    await expect(page.locator('[data-export-preview-layer]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-dex-export-confirm]')).toBeVisible();
    await expect(page.locator('[data-export-sort="national"]')).toBeVisible();
    await expect(page.locator('[data-export-team]')).toHaveCount(0);
    await expect(page.locator('[data-export-survey-host]')).toHaveCount(0);
    expect(downloads, 'old Dex export started a download before settings').toEqual([]);

    await waitPreviewReady(page);
    const firstSrc = await page.locator('[data-export-preview-layer] img').getAttribute('src');
    expect(firstSrc).toBeTruthy();

    await page.locator('[data-export-sort="national"]').click();
    await expect
      .poll(async () => page.locator('[data-export-preview-layer] img').getAttribute('src'), { timeout: 45_000 })
      .not.toBe(firstSrc);
    await waitPreviewReady(page);
  });

  test('save image opens the early-export survey', async ({ page }) => {
    await page.route('**/api/submit', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            highlight: { ordinal: 151, tool: 'pokedex', firstPokemonId: 25 },
          }),
        });
        return;
      }
      await route.continue();
    });
    await openDexExport(page);
    await waitPreviewReady(page);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 45_000 }).catch(() => null),
      page.locator('[data-dex-export-confirm]').click(),
    ]);
    await download?.cancel().catch(() => undefined);
    const intro = page.locator('[data-export-survey-intro]');
    await expect(intro).toBeVisible({ timeout: 20_000 });
    await expect(intro).toContainText("You're here early!");
    await expect(intro).toContainText('Pokedex');
  });
});

test.describe('mobile dex export sheet', () => {
  test.use({ viewport: MOBILE });
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 1024, 'the sheet is hidden at md');

  test('keeps the preview above the settings sheet', async ({ page }) => {
    await openDexExport(page);
    await waitPreviewReady(page);
    await parkPreview(page);
    const fit = await previewFitsBand(page, MOBILE.height);
    expect(fit.ok, fit.reason).toBe(true);

    await page.locator('[data-export-sort="national"]').click();
    await waitPreviewReady(page);
    await parkPreview(page);
    const fitNational = await previewFitsBand(page, MOBILE.height);
    expect(fitNational.ok, `national: ${fitNational.reason}`).toBe(true);
  });
});

test.describe('dex export settings isolation', () => {
  test('does not change the View page sort', async ({ page }) => {
    await openDexExport(page);
    await waitPreviewReady(page);
    const before = await page.evaluate(() => {
      const raw = localStorage.getItem(
        Object.keys(localStorage).find((k) => k.includes('pokedex') || k.includes('my151')) ?? '',
      );
      return raw;
    });
    await page.locator('[data-export-sort="national"]').click();
    await expect(page.locator('[data-export-outlines]')).toBeDisabled();
    await page.locator('[data-export-scrim] button').click();
    await expect(page.locator('[data-export-preview-layer]')).toHaveCount(0);
    const after = await page.evaluate(() => {
      const raw = localStorage.getItem(
        Object.keys(localStorage).find((k) => k.includes('pokedex') || k.includes('my151')) ?? '',
      );
      return raw;
    });
    expect(after).toBe(before);
    await page.getByRole('button', { name: 'View settings' }).click();
    await expect(page.getByText('Show detailed stats')).toHaveCount(0);
  });
});

test.describe('mobile dex export copy', () => {
  test.use({ viewport: MOBILE });
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 1024, 'descriptions stay on the sheet');

  test('keeps sort-order descriptions on the sheet', async ({ page }) => {
    await openDexExport(page);
    await expect(page.locator('[data-export-sort="build-order"]')).toBeVisible();
    await expect(page.getByText(/mirrors your build page/i)).toBeVisible();
    await expect(page.locator('[data-export-outlines]')).toBeVisible();
  });
});

test.describe('desktop dex export preview', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('tilts only near the card and keeps the export in view', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one desktop pass');
    await openDexExport(page);
    await waitPreviewReady(page);
    await parkPreview(page);
    const foil = page.locator('[data-export-preview]');
    await page.mouse.move(16, 16);
    await page.waitForTimeout(80);
    const far = await foil.getAttribute('data-tilt-x');
    expect(Math.abs(Number(far ?? '99'))).toBeLessThan(1);

    const box = await foil.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + 8, box!.y + 8);
    await page.waitForTimeout(80);
    const near = await foil.getAttribute('data-tilt-x');
    expect(Math.abs(Number(near ?? '0'))).toBeGreaterThan(0.4);

    const fit = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('[data-export-preview]');
      const layer = document.querySelector<HTMLElement>('[data-export-preview-layer]');
      if (!card || !layer) return { ok: false, reason: 'missing nodes' };
      const c = card.getBoundingClientRect();
      const l = layer.getBoundingClientRect();
      if (c.left < l.left - 2) return { ok: false, reason: `left ${c.left}` };
      if (c.right > l.right + 2) return { ok: false, reason: `right ${c.right}` };
      if (c.top < l.top - 2) return { ok: false, reason: `top ${c.top}` };
      if (c.bottom > l.bottom + 2) return { ok: false, reason: `bottom ${c.bottom}` };
      if (c.right > window.innerWidth + 2 || c.bottom > window.innerHeight + 2) {
        return { ok: false, reason: 'past viewport' };
      }
      return { ok: true, reason: '' };
    });
    expect(fit.ok, fit.reason).toBe(true);
  });

  test('keeps the card left of the settings pane', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one desktop pass');
    await openDexExport(page);
    await waitPreviewReady(page);
    const fit = await page.evaluate(() => {
      const img = document.querySelector<HTMLElement>('[data-export-preview-layer] img');
      const layer = document.querySelector<HTMLElement>('[data-export-preview-layer]');
      const pane = document.querySelector<HTMLElement>('[data-export-chrome]');
      if (!img || !layer || !pane) return { ok: false, reason: 'missing nodes' };
      const i = img.getBoundingClientRect();
      const l = layer.getBoundingClientRect();
      const p = pane.getBoundingClientRect();
      if (i.right > l.right + 2) return { ok: false, reason: `img past layer ${i.right} > ${l.right}` };
      if (i.left < l.left - 2) return { ok: false, reason: 'img left of layer' };
      if (i.top < l.top - 2 || i.bottom > l.bottom + 2) return { ok: false, reason: 'img vertical overflow' };
      if (i.right > p.left + 2) return { ok: false, reason: `img under pane ${i.right} > ${p.left}` };
      return { ok: true, reason: '' };
    });
    expect(fit.ok, fit.reason).toBe(true);
  });
});
