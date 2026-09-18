import { expect, test, type Page } from '@playwright/test';
import { seededLeague } from './support/leagueSeed';

const MOBILE = { width: 390, height: 844 } as const;

async function openLeagueExport(page: Page) {
  await seededLeague(page);
  await page.goto('/custom-gym-leader');
  await page.locator('[data-testid="league-slot-0"]').waitFor();
  await page.locator('[data-league-export]').first().click();
  await page.locator('[data-export-preview] img').waitFor({ timeout: 45_000 });
  await page.locator('[data-export-preview] img').evaluate((el: HTMLImageElement) => {
    if (el.complete && el.naturalWidth > 0) return;
    return new Promise<void>((resolve, reject) => {
      el.addEventListener('load', () => resolve(), { once: true });
      el.addEventListener('error', () => reject(new Error('preview image failed')), { once: true });
    });
  });
}

async function waitPreviewReady(page: Page) {
  const confirm = page.locator('[data-league-export-confirm]');
  await expect(confirm).toBeEnabled({ timeout: 45_000 });
  const img = page.locator('[data-export-preview] img');
  await img.waitFor({ timeout: 45_000 });
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
    const img = document.querySelector<HTMLElement>('[data-export-preview] img');
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
    if (gutter < 4) return { ok: false, reason: `tight gutter ${gutter}` };
    const cover = Math.max(i.width / l.width, i.height / l.height);
    if (cover < 0.78) return { ok: false, reason: `cover ${cover.toFixed(3)}` };
    if (s && i.bottom > s.top + pad) return { ok: false, reason: `img under sheet ${i.bottom} > ${s.top}` };
    if (i.height < 80) return { ok: false, reason: `tiny img ${i.height}` };
    if (s && s.height > Math.round(vh * 0.45) + 8) {
      return { ok: false, reason: `sheet too tall ${s.height}` };
    }
    return {
      ok: true,
      reason: '',
      img: { top: i.top, bottom: i.bottom, width: i.width, height: i.height },
      layer: { top: l.top, bottom: l.bottom, width: l.width, height: l.height },
      sheetTop: s?.top ?? null,
    };
  }, viewportHeight);
}

test.describe('mobile export sheet', () => {
  test.use({ viewport: MOBILE });

  test('keeps story, rematch, and both-team previews above the sheet', async ({ page }) => {
    await openLeagueExport(page);

    for (const mode of ['story', 'rematch', 'both'] as const) {
      await page.locator(`[data-export-team="${mode}"]`).click();
      await waitPreviewReady(page);
      await parkPreview(page);
      const fit = await previewFitsBand(page, MOBILE.height);
      expect(fit.ok, `${mode}: ${fit.reason}`).toBe(true);
    }
  });

  test('tap parks idle tilt and pointer still tilts the card', async ({ page }) => {
    await openLeagueExport(page);
    const foil = page.locator('[data-export-preview]');
    await expect(foil).toHaveAttribute('data-paused', '0');

    await expect(page.locator('[data-foil-layer]')).toHaveCount(4);
    await expect(page.locator('[data-foil-layer="holographic"]')).toHaveCount(1);
    await expect(page.locator('[data-foil-layer="sparkle"]')).toHaveCount(1);
    await expect(page.locator('[data-foil-layer="ambient"]')).toHaveCount(0);
    await expect(page.locator('[data-foil-layer="emboss"]')).toHaveCount(0);
    const idleA = Number(await foil.getAttribute('data-tilt-x'));
    await expect
      .poll(async () => Number(await foil.getAttribute('data-tilt-x')), { timeout: 2500 })
      .not.toBe(idleA);

    await expect
      .poll(
        async () => {
          const x = Number(await foil.getAttribute('data-tilt-x'));
          const y = Number(await foil.getAttribute('data-tilt-y'));
          return Math.hypot(x, y);
        },
        { timeout: 6000 },
      )
      .toBeGreaterThan(3.5);
    await expect
      .poll(async () => Number(await foil.getAttribute('data-foil-opacity')), { timeout: 6000 })
      .toBeGreaterThan(0.05);

    const box = await foil.boundingBox();
    expect(box).toBeTruthy();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.mouse.click(cx, cy);
    await expect.poll(async () => foil.getAttribute('data-paused')).toBe('1');
    await page.waitForTimeout(450);
    expect(Math.abs(Number(await foil.getAttribute('data-tilt-x')))).toBeLessThan(0.6);
    expect(Math.abs(Number(await foil.getAttribute('data-tilt-y')))).toBeLessThan(0.6);

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + box!.width * 0.35, cy - box!.height * 0.3, { steps: 8 });
    await expect.poll(async () => Math.abs(Number(await foil.getAttribute('data-tilt-x')))).toBeGreaterThan(3);
    expect(await foil.getAttribute('data-paused')).toBe('1');
    await page.mouse.up();
  });
});

test.describe('desktop export preview', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('keeps the card inside the band left of the settings pane', async ({ page }) => {
    await openLeagueExport(page);
    await expect(page.locator('[data-foil-workshop-link]')).toHaveCount(0);
    for (const mode of ['story', 'rematch', 'both'] as const) {
      await page.locator(`[data-export-team="${mode}"]`).click();
      await waitPreviewReady(page);
      await page.waitForTimeout(200);
      const fit = await page.evaluate(() => {
        const img = document.querySelector<HTMLElement>('[data-export-preview] img');
        const layer = document.querySelector<HTMLElement>('[data-export-preview-layer]');
        const pane = document.querySelector<HTMLElement>('[data-export-chrome]');
        if (!img || !layer || !pane) return { ok: false, reason: 'missing nodes' };
        const i = img.getBoundingClientRect();
        const l = layer.getBoundingClientRect();
        const p = pane.getBoundingClientRect();
        if (i.right > l.right + 2) return { ok: false, reason: `img past layer ${i.right} > ${l.right}` };
        if (i.left < l.left - 2) return { ok: false, reason: `img left of layer` };
        if (i.top < l.top - 2 || i.bottom > l.bottom + 2) return { ok: false, reason: `img vertical overflow` };
        if (i.right > p.left + 2) return { ok: false, reason: `img under pane ${i.right} > ${p.left}` };
        return { ok: true, reason: '' };
      });
      expect(fit.ok, `${mode}: ${fit.reason}`).toBe(true);
    }
  });
});
