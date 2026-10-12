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

async function exportShapePixels(page: Page) {
  return page.locator('[data-export-preview] img').evaluate((el: HTMLImageElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = el.naturalWidth;
    canvas.height = el.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx || el.naturalWidth < 8 || el.naturalHeight < 8) {
      return {
        ok: false,
        cornerA: 255,
        roundedCutA: 255,
        edgeA: 0,
        innerA: 0,
        innerCurveRgb: [0, 0, 0],
        innerFillRgb: [0, 0, 0],
      };
    }
    ctx.drawImage(el, 0, 0);
    const corner = ctx.getImageData(0, 0, 1, 1).data;
    const roundedCut = ctx.getImageData(Math.floor(el.naturalWidth * 0.02), 1, 1, 1).data;
    const edge = ctx.getImageData(Math.floor(el.naturalWidth / 2), 2, 1, 1).data;
    const inner = ctx.getImageData(Math.floor(el.naturalWidth / 2), Math.floor(el.naturalHeight / 2), 1, 1).data;
    const innerEdge = Math.ceil(el.naturalWidth * 0.014);
    const innerCurve = ctx.getImageData(innerEdge, el.naturalHeight - innerEdge, 1, 1).data;
    const innerFill = ctx.getImageData(Math.floor(el.naturalWidth * 0.08), el.naturalHeight - innerEdge, 1, 1).data;
    return {
      ok: true,
      cornerA: corner[3] ?? 255,
      roundedCutA: roundedCut[3] ?? 255,
      edgeA: edge[3] ?? 0,
      innerA: inner[3] ?? 0,
      innerCurveRgb: [innerCurve[0], innerCurve[1], innerCurve[2]],
      innerFillRgb: [innerFill[0], innerFill[1], innerFill[2]],
    };
  });
}

async function parkPreview(page: Page) {
  const foil = page.locator('[data-export-preview]');
  if ((await foil.getAttribute('data-paused')) === '1') return;
  const box = await page.locator('[data-export-tilt-hit]').boundingBox();
  if (!box) return;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 48, y - 32, { steps: 6 });
  await page.mouse.up();
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
    if (cover < 0.72) return { ok: false, reason: `cover ${cover.toFixed(3)}` };
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

  test('drag release stays flat and a tap resumes auto-tilt', async ({ page }) => {
    await openLeagueExport(page);
    const foil = page.locator('[data-export-preview]');
    await expect(foil).toHaveAttribute('data-paused', '0');

    // The default layers, and only those: point light, prism, gleam, iridescence.
    await expect
      .poll(async () => (await page.locator('[data-foil-layer]').evaluateAll((els) => els.map((el) => el.getAttribute('data-foil-layer')))).sort().join(','))
      .toBe('gleam,iridescence,pointLight,prism');
    await expect(page.locator('[data-foil-layer="sparkle"]')).toHaveCount(0);
    expect(await foil.evaluate((el) => getComputedStyle(el, '::after').content)).toBe('none');
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
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + box!.width * 0.35, cy - box!.height * 0.3, { steps: 8 });
    await expect
      .poll(async () => {
        const x = Number(await foil.getAttribute('data-tilt-x'));
        const y = Number(await foil.getAttribute('data-tilt-y'));
        return Math.hypot(x, y);
      })
      .toBeGreaterThan(2.4);
    await page.mouse.up();
    await expect.poll(async () => foil.getAttribute('data-paused')).toBe('1');
    await page.waitForTimeout(700);
    expect(await foil.getAttribute('data-export-orbit')).toBe('paused');
    expect(Math.abs(Number(await foil.getAttribute('data-tilt-x')))).toBeLessThan(0.6);
    expect(Math.abs(Number(await foil.getAttribute('data-tilt-y')))).toBeLessThan(0.6);

    await page.mouse.click(cx, cy);
    await expect.poll(async () => foil.getAttribute('data-paused')).toBe('0');
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 40, cy + 28, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => foil.getAttribute('data-paused')).toBe('1');
    await page.waitForTimeout(700);
    expect(await foil.getAttribute('data-export-orbit')).toBe('paused');
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

  test('exports rounded league corners without clearing edges or content', async ({ page }) => {
    await openLeagueExport(page);
    await waitPreviewReady(page);
    const pixels = await exportShapePixels(page);
    expect(pixels.ok, JSON.stringify(pixels)).toBe(true);
    expect(pixels.cornerA, JSON.stringify(pixels)).toBe(0);
    expect(pixels.roundedCutA, JSON.stringify(pixels)).toBe(0);
    expect(pixels.edgeA, JSON.stringify(pixels)).toBe(255);
    expect(pixels.innerA, JSON.stringify(pixels)).toBe(255);
  });

  test('paints ink-only rainbow on the live league overlay', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one desktop pass');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openLeagueExport(page);
    await waitPreviewReady(page);
    const foil = page.locator('[data-export-preview]');
    await expect.poll(async () => foil.getAttribute('data-foil-maps')).toBe('1');
    const rainbowOnOpen = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('[data-export-preview]');
      const layer = document.querySelector<HTMLElement>('[data-foil-layer="gleam"]');
      if (!card || !layer) return { ok: false, reason: 'missing' };
      const cs = getComputedStyle(layer);
      if (cs.mixBlendMode !== 'color-dodge') return { ok: false, reason: `blend ${cs.mixBlendMode}` };
      if (Number(cs.opacity) <= 0.04) return { ok: false, reason: `opacity ${cs.opacity}` };
      if (!cs.backgroundImage.includes('repeating-linear-gradient')) {
        return { ok: false, reason: 'no V bands' };
      }
      const glare = getComputedStyle(card, '::before');
      const glareMask = `${glare.getPropertyValue('-webkit-mask-image')} ${glare.maskImage}`;
      if (!glareMask.includes('none')) return { ok: false, reason: `glare mask ${glareMask}` };
      if (Math.abs(Number(getComputedStyle(card).getPropertyValue('--foil-gleam')) - 0.65) > 0.02) {
        return { ok: false, reason: 'amount' };
      }
      return { ok: true, reason: 'open' };
    });
    expect(rainbowOnOpen.ok, rainbowOnOpen.reason).toBe(true);
    const hit = page.locator('[data-export-tilt-hit]');
    const box = await hit.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width * 0.82, box!.y + box!.height * 0.18, { steps: 10 });
    await expect.poll(async () => foil.getAttribute('data-export-orbit')).toBe('pointer');
    // The springs start from the auto-tilt pose, so wait for the hover pose.
    await expect
      .poll(async () => Math.hypot(Number(await foil.getAttribute('data-tilt-x')), Number(await foil.getAttribute('data-tilt-y'))))
      .toBeGreaterThan(2);
    const holo = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('[data-export-preview]');
      const layer = document.querySelector<HTMLElement>('[data-foil-layer="gleam"]');
      if (!card || !layer) return { ok: false, reason: 'missing' };
      const cs = getComputedStyle(layer);
      const mask = `${cs.getPropertyValue('-webkit-mask-image')} ${cs.maskImage}`.replace(/\s+/g, ' ').trim();
      return {
        ok: true,
        mix: cs.mixBlendMode,
        opacity: Number(cs.opacity),
        mask,
        amount: Number(getComputedStyle(card).getPropertyValue('--foil-gleam')),
        foil: Number(card.getAttribute('data-foil-opacity')),
        // The drop shadow is the PNG's own shape, blurred.
        shadow: document.querySelectorAll('[data-export-shadow-layer]').length,
        hypot: Math.hypot(Number(card.getAttribute('data-tilt-x') || 0), Number(card.getAttribute('data-tilt-y') || 0)),
      };
    });
    expect(holo.ok, JSON.stringify(holo)).toBe(true);
    expect(holo.mix, JSON.stringify(holo)).toBe('color-dodge');
    expect(holo.amount, JSON.stringify(holo)).toBeCloseTo(0.65, 2);
    expect(holo.mask, JSON.stringify(holo)).toMatch(/url\(/);
    expect(holo.foil, JSON.stringify(holo)).toBeGreaterThan(0.2);
    expect(holo.shadow, JSON.stringify(holo)).toBe(2);
    expect(holo.hypot, JSON.stringify(holo)).toBeGreaterThan(2);
    expect(holo.hypot, JSON.stringify(holo)).toBeLessThanOrEqual(10.2);
  });
});

test.describe('compact trainer export on a phone', () => {
  test.use({ viewport: MOBILE });

  async function sheetHeight(page: Page): Promise<number> {
    const box = await page.locator('[data-export-chrome]').boundingBox();
    expect(box).toBeTruthy();
    return box!.height;
  }

  test('the trainer card sheet fits its content; the league sheet keeps its band', async ({ page }) => {
    await seededLeague(page);
    await page.goto('/custom-gym-leader');
    await page.locator('[data-testid="league-slot-0"]').waitFor();
    await page.locator('[data-testid="league-slot-0"]').click();
    await page.locator('[aria-label="Export trainer card"]').click();
    await waitPreviewReady(page);
    await expect(page.locator('[data-export-card-order]')).toHaveCount(2);
    await expect(page.locator('[data-export-card-order="fixed"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-league-export-confirm]')).toBeInViewport();
    const card = await sheetHeight(page);
    expect(card, 'trainer card sheet height').toBeLessThan(MOBILE.height * 0.3);
    const layer = await page.locator('[data-export-preview-layer]').boundingBox();
    expect(layer, 'preview layer').toBeTruthy();
    expect(layer!.height, 'preview gets the space the sheet gave up').toBeGreaterThan(MOBILE.height - card - 2);

    await page.keyboard.press('Escape');
    await page.goto('/custom-gym-leader');
    await page.locator('[data-testid="league-slot-0"]').waitFor();
    await page.locator('[data-league-export]').first().click();
    await waitPreviewReady(page);
    await expect(page.locator('[data-export-no-settings]')).toHaveCount(0);
    expect(await sheetHeight(page), 'league sheet height').toBeGreaterThan(MOBILE.height * 0.4);
  });
});

test.describe('gym trainer-card export', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('shares ink-only rainbow with league and Dex', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one desktop pass');
    await seededLeague(page);
    await page.goto('/custom-gym-leader');
    await page.locator('[data-testid="league-slot-0"]').waitFor();
    await page.locator('[data-testid="league-slot-0"]').click();
    await page.locator('[aria-label="Export trainer card"]').click();
    await page.locator('[data-export-preview] img').waitFor({ timeout: 45_000 });
    const pixels = await exportShapePixels(page);
    expect(pixels.ok, JSON.stringify(pixels)).toBe(true);
    expect(pixels.cornerA, JSON.stringify(pixels)).toBe(0);
    expect(pixels.roundedCutA, JSON.stringify(pixels)).toBe(0);
    expect(pixels.edgeA, JSON.stringify(pixels)).toBe(255);
    expect(pixels.innerA, JSON.stringify(pixels)).toBe(255);
    expect(pixels.innerCurveRgb, JSON.stringify(pixels)).not.toEqual(pixels.innerFillRgb);
    const foil = page.locator('[data-export-preview]');
    await expect.poll(async () => foil.getAttribute('data-foil-maps'), { timeout: 20_000 }).toBe('1');
    const hit = page.locator('[data-export-tilt-hit]');
    const box = await hit.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width * 0.82, box!.y + box!.height * 0.18, { steps: 10 });
    await expect.poll(async () => foil.getAttribute('data-export-orbit')).toBe('pointer');
    // The springs start from the auto-tilt pose, so wait for the hover pose.
    await expect
      .poll(async () => Math.hypot(Number(await foil.getAttribute('data-tilt-x')), Number(await foil.getAttribute('data-tilt-y'))))
      .toBeGreaterThan(2);
    const holo = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('[data-export-preview]');
      const layer = document.querySelector<HTMLElement>('[data-foil-layer="gleam"]');
      if (!card || !layer) return { ok: false, mix: '', mask: '', amount: 0 };
      const cs = getComputedStyle(layer);
      return {
        ok: true,
        mix: cs.mixBlendMode,
        mask: `${cs.getPropertyValue('-webkit-mask-image')} ${cs.maskImage}`,
        amount: Number(getComputedStyle(card).getPropertyValue('--foil-gleam')),
        hypot: Math.hypot(Number(card.getAttribute('data-tilt-x') || 0), Number(card.getAttribute('data-tilt-y') || 0)),
      };
    });
    expect(holo.ok, JSON.stringify(holo)).toBe(true);
    expect(holo.mix, JSON.stringify(holo)).toBe('color-dodge');
    expect(holo.amount, JSON.stringify(holo)).toBeCloseTo(0.65, 2);
    expect(holo.mask, JSON.stringify(holo)).toMatch(/url\(/);
    expect(holo.hypot, JSON.stringify(holo)).toBeGreaterThan(2);
    expect(holo.hypot, JSON.stringify(holo)).toBeLessThanOrEqual(10.2);
  });
});
