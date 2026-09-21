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
  const img = page.locator('[data-export-preview] img');
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
    const firstSrc = await page.locator('[data-export-preview] img').getAttribute('src');
    expect(firstSrc).toBeTruthy();

    await page.locator('[data-export-sort="national"]').click();
    await expect
      .poll(async () => page.locator('[data-export-preview] img').getAttribute('src'), { timeout: 45_000 })
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
    const sprite = page.locator('[data-export-survey-sprite]');
    await expect(sprite).toBeVisible();
    const scale = await sprite.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const devicePx = r.width * dpr;
      const native = el instanceof HTMLImageElement && el.naturalWidth > 0 ? el.naturalWidth : 96;
      const multiple = devicePx / native;
      const attr = Number(el.getAttribute('data-sprite-scale') || 0);
      const minMultiple = window.innerWidth < 1024 ? 1.94 : 0.94;
      return {
        devicePx,
        native,
        multiple,
        attr,
        minMultiple,
        integer: Math.abs(multiple - Math.round(multiple)) < 0.06 && devicePx + 0.5 >= native,
      };
    });
    expect(scale.integer, `device ${scale.devicePx} native ${scale.native}`).toBe(true);
    expect(scale.multiple, JSON.stringify(scale)).toBeGreaterThan(scale.minMultiple);
    expect(scale.attr, JSON.stringify(scale)).toBeGreaterThanOrEqual(scale.minMultiple >= 1.94 ? 2 : 1);
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

  test('fills the overlay, shows clipped holo, and leaves corner radii open', async ({ page }) => {
    await openDexExport(page);
    await waitPreviewReady(page);
    await expect.poll(async () => page.locator('[data-export-preview]').getAttribute('data-foil-maps'), { timeout: 15_000 }).toBe('1');
    const foil = page.locator('[data-export-preview]');
    await expect.poll(async () => Number(await foil.getAttribute('data-foil-opacity')), { timeout: 8000 }).toBeGreaterThan(0.1);
    const measure = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('[data-export-preview]');
      const layer = document.querySelector<HTMLElement>('[data-export-preview-layer]');
      const holo = document.querySelector<HTMLElement>('[data-foil-layer="holographic"]');
      if (!card || !layer || !holo) return { ok: false, reason: 'missing' };
      const c = card.getBoundingClientRect();
      const l = layer.getBoundingClientRect();
      const h = holo.getBoundingClientRect();
      const cover = Math.max(c.width / l.width, c.height / l.height);
      const style = getComputedStyle(card);
      const holoStyle = getComputedStyle(holo);
      const bg = style.backgroundColor.replace(/\s+/g, '');
      const clip = `${style.getPropertyValue('clip-path')} ${style.getPropertyValue('-webkit-clip-path')}`;
      const mask = `${holoStyle.getPropertyValue('-webkit-mask-image')} ${holoStyle.getPropertyValue('mask-image')}`.replace(/\s+/g, ' ').trim();
      if (cover < 0.78) return { ok: false, reason: `cover ${cover.toFixed(3)}` };
      if (c.left < l.left - 4 || c.right > l.right + 4 || c.top < l.top - 4 || c.bottom > l.bottom + 4) {
        return { ok: false, reason: 'overflow' };
      }
      if (bg !== 'transparent' && bg !== 'rgba(0,0,0,0)' && bg !== 'rgba(0,0,0,0.0)') {
        return { ok: false, reason: `corner fill ${bg}` };
      }
      if (!/round/i.test(clip)) return { ok: false, reason: `clip ${clip}` };
      if (!mask.includes('url(')) return { ok: false, reason: `holo unmasked ${mask}` };
      if (holoStyle.mixBlendMode !== 'multiply') return { ok: false, reason: `blend ${holoStyle.mixBlendMode}` };
      if (Number(holoStyle.opacity) <= 0.02) return { ok: false, reason: `holo opacity ${holoStyle.opacity}` };
      const holoAmt = Number(style.getPropertyValue('--foil-holographic'));
      if (Math.abs(holoAmt - 0.52) > 0.02) return { ok: false, reason: `holo amount ${holoAmt}` };
      if (h.left < c.left - 2 || h.right > c.right + 2 || h.top < c.top - 2 || h.bottom > c.bottom + 2) {
        return { ok: false, reason: 'holo outside card' };
      }
      if (style.overflow !== 'hidden' || style.transformStyle.includes('preserve-3d')) {
        return { ok: false, reason: 'clipper' };
      }
      return { ok: true, reason: `cover ${cover.toFixed(3)}` };
    });
    expect(measure.ok, measure.reason).toBe(true);
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
    await page.locator('[data-export-outlines]').waitFor();
    await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('[data-export-scrim] button')?.click();
    });
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
    const foil = page.locator('[data-export-preview]');
    const hit = page.locator('[data-export-tilt-hit]');
    await page.mouse.move(16, 16);
    await page.waitForTimeout(80);
    await expect.poll(async () => foil.getAttribute('data-export-orbit')).toBe('idle');

    const box = await hit.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width * 0.82, box!.y + box!.height * 0.18, { steps: 10 });
    await expect
      .poll(async () => {
        const x = Number(await foil.getAttribute('data-tilt-x'));
        const y = Number(await foil.getAttribute('data-tilt-y'));
        return Math.hypot(x, y);
      })
      .toBeGreaterThan(0.4);
    await expect.poll(async () => foil.getAttribute('data-export-orbit')).toBe('pointer');
    await expect.poll(async () => foil.getAttribute('data-tilt-scale')).toBe('1');

    const fit = await page.evaluate(() => {
      const hitEl = document.querySelector<HTMLElement>('[data-export-tilt-hit]');
      const layer = document.querySelector<HTMLElement>('[data-export-preview-layer]');
      if (!hitEl || !layer) return { ok: false, reason: 'missing nodes' };
      const c = hitEl.getBoundingClientRect();
      const l = layer.getBoundingClientRect();
      if (c.left < l.left - 2) return { ok: false, reason: `left ${c.left}` };
      if (c.right > l.right + 2) return { ok: false, reason: `right ${c.right}` };
      if (c.top < l.top - 2) return { ok: false, reason: `top ${c.top}` };
      if (c.bottom > l.bottom + 2) return { ok: false, reason: `bottom ${c.bottom}` };
      return { ok: true, reason: '' };
    });
    expect(fit.ok, fit.reason).toBe(true);
  });

  test('keeps the card left of the settings pane', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one desktop pass');
    await openDexExport(page);
    await waitPreviewReady(page);
    const fit = await page.evaluate(() => {
      const hitEl = document.querySelector<HTMLElement>('[data-export-tilt-hit]');
      const layer = document.querySelector<HTMLElement>('[data-export-preview-layer]');
      const pane = document.querySelector<HTMLElement>('[data-export-chrome]');
      if (!hitEl || !layer || !pane) return { ok: false, reason: 'missing nodes' };
      const i = hitEl.getBoundingClientRect();
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

  test('auto-tilts with the pointer frozen, then hover does not bounce-zoom', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one desktop pass');
    await openDexExport(page);
    await waitPreviewReady(page);
    const foil = page.locator('[data-export-preview]');
    const hit = page.locator('[data-export-tilt-hit]');
    await expect.poll(async () => foil.getAttribute('data-foil-maps'), { timeout: 15_000 }).toBe('1');
    await expect.poll(async () => foil.getAttribute('data-export-orbit')).toBe('idle');
    await hit.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: 'mouse', pointerId: 1 };
      el.dispatchEvent(new PointerEvent('pointermove', opts));
      el.dispatchEvent(new PointerEvent('pointermove', opts));
    });
    await expect
      .poll(
        async () => {
          const x = Number(await foil.getAttribute('data-tilt-x'));
          const y = Number(await foil.getAttribute('data-tilt-y'));
          return Math.hypot(x, y);
        },
        { timeout: 8000 },
      )
      .toBeGreaterThan(2.5);
    const sample = async () => {
      return foil.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hitEl = document.querySelector('[data-export-tilt-hit]');
        const hitStyle = hitEl instanceof HTMLElement ? getComputedStyle(hitEl) : null;
        const x = Number(el.getAttribute('data-tilt-x'));
        const y = Number(el.getAttribute('data-tilt-y'));
        return {
          x,
          y,
          hypot: Math.hypot(x, y),
          orbit: el.getAttribute('data-export-orbit'),
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
          perspective: hitStyle?.perspective ?? '',
          transformStyle: hitStyle?.transformStyle ?? '',
        };
      });
    };
    const a = await sample();
    await page.waitForTimeout(2500);
    const b = await sample();
    const visual = Math.hypot(b.top - a.top, b.left - a.left, b.width - a.width, b.height - a.height);
    expect(a.orbit, JSON.stringify({ a, b, visual })).toBe('idle');
    expect(b.orbit, JSON.stringify({ a, b, visual })).toBe('idle');
    expect(Math.max(a.hypot, b.hypot), JSON.stringify({ a, b, visual })).toBeGreaterThan(2.5);
    const aligned =
      a.hypot * b.hypot > 0 ? Math.abs(a.x * b.x + a.y * b.y) / (a.hypot * b.hypot) : 1;
    expect(aligned, JSON.stringify({ a, b, aligned, visual })).toBeLessThan(0.85);
    expect(visual, JSON.stringify({ a, b, visual })).toBeGreaterThan(4);
    expect(a.perspective.startsWith('600'), a.perspective).toBe(true);
    expect(b.transformStyle.includes('preserve-3d'), b.transformStyle).toBe(true);
    expect(Math.max(a.hypot, b.hypot), JSON.stringify({ a, b })).toBeLessThan(16);
    const inView = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('[data-export-preview]');
      const layer = document.querySelector<HTMLElement>('[data-export-preview-layer]');
      if (!card || !layer) return { ok: false, reason: 'missing' };
      const c = card.getBoundingClientRect();
      const l = layer.getBoundingClientRect();
      if (c.left < l.left - 4 || c.right > l.right + 4 || c.top < l.top - 4 || c.bottom > l.bottom + 4) {
        return { ok: false, reason: 'layer' };
      }
      if (c.left < -4 || c.top < -4 || c.right > innerWidth + 4 || c.bottom > innerHeight + 4) {
        return { ok: false, reason: 'viewport' };
      }
      return { ok: true, reason: '' };
    });
    expect(inView.ok, inView.reason).toBe(true);
    const shineClip = await foil.evaluate((el) => {
      const style = getComputedStyle(el);
      const holo = document.querySelector<HTMLElement>('[data-foil-layer="holographic"]');
      const bloom = document.querySelector('[data-foil-layer="bloom"]');
      const c = el.getBoundingClientRect();
      const overflowLayers: string[] = [];
      for (const layer of el.querySelectorAll('[data-foil-layer]')) {
        if (!(layer instanceof HTMLElement)) continue;
        const r = layer.getBoundingClientRect();
        if (r.left < c.left - 2 || r.right > c.right + 2 || r.top < c.top - 2 || r.bottom > c.bottom + 2) {
          overflowLayers.push(layer.dataset.foilLayer || '');
        }
      }
      const holoStyle = holo ? getComputedStyle(holo) : null;
      const mask = (holoStyle
        ? `${holoStyle.getPropertyValue('-webkit-mask-image')} ${holoStyle.getPropertyValue('mask-image')}`
        : ''
      )
        .replace(/\s+/g, ' ')
        .trim();
      const holoAmt = Number(style.getPropertyValue('--foil-holographic'));
      return {
        overflow: style.overflow,
        preserve3d: style.transformStyle,
        bloom: Boolean(bloom),
        overflowLayers,
        holoMask: mask,
        holoOpacity: holoStyle ? Number(holoStyle.opacity) : 0,
        holoAmt,
        ok:
          style.overflow === 'hidden' &&
          !style.transformStyle.includes('preserve-3d') &&
          overflowLayers.length === 0 &&
          mask.includes('url(') &&
          Math.abs(holoAmt - 0.52) < 0.02 &&
          !(bloom instanceof HTMLElement && getComputedStyle(bloom).inset.includes('-')),
      };
    });
    expect(shineClip.ok, JSON.stringify(shineClip)).toBe(true);
    await expect.poll(async () => Number(await foil.getAttribute('data-foil-opacity'))).toBeGreaterThan(0.1);

    const box = await hit.boundingBox();
    expect(box).toBeTruthy();
    const widths: number[] = [];
    for (const [u, v] of [
      [0.2, 0.2],
      [0.8, 0.2],
      [0.8, 0.8],
      [0.2, 0.8],
    ] as const) {
      await page.mouse.move(box!.x + box!.width * u, box!.y + box!.height * v, { steps: 6 });
      widths.push(
        await foil.evaluate((el) => (el as HTMLElement).offsetWidth),
      );
    }
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(2);
    expect(await foil.getAttribute('data-tilt-scale')).toBe('1');
    await expect.poll(async () => foil.getAttribute('data-export-orbit')).toBe('pointer');

    await hit.click();
    await expect.poll(async () => foil.getAttribute('data-paused')).toBe('1');
    await page.waitForTimeout(450);
    expect(Math.abs(Number(await foil.getAttribute('data-tilt-x')))).toBeLessThan(0.8);
    expect(Math.abs(Number(await foil.getAttribute('data-tilt-y')))).toBeLessThan(0.8);

    const fill = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('[data-export-preview]');
      const layer = document.querySelector<HTMLElement>('[data-export-preview-layer]');
      if (!card || !layer) return { ok: false, reason: 'missing', ratio: 0 };
      const c = card.getBoundingClientRect();
      const l = layer.getBoundingClientRect();
      const ratio = Math.max(c.width / l.width, c.height / l.height);
      if (c.left < l.left - 4 || c.right > l.right + 4 || c.top < l.top - 4 || c.bottom > l.bottom + 4) {
        return { ok: false, reason: 'overflow', ratio };
      }
      return { ok: ratio >= 0.78, reason: `cover ${ratio.toFixed(3)}`, ratio };
    });
    expect(fill.ok, fill.reason).toBe(true);

    const corners = await foil.evaluate((el) => {
      const style = getComputedStyle(el);
      const clip = `${style.getPropertyValue('clip-path')} ${style.getPropertyValue('-webkit-clip-path')}`;
      const bg = style.backgroundColor.replace(/\s+/g, '');
      const transparent = bg === 'transparent' || bg === 'rgba(0,0,0,0)' || bg === 'rgba(0,0,0,0.0)';
      return {
        bg,
        clip,
        ok: transparent && /round/i.test(clip) && !el.className.includes('bg-white'),
      };
    });
    expect(corners.ok, JSON.stringify(corners)).toBe(true);

    await hit.click();
    await expect.poll(async () => foil.getAttribute('data-paused')).toBe('0');
    await expect.poll(async () => Number(await foil.getAttribute('data-foil-opacity'))).toBeGreaterThan(0.1);
  });

  test('copies hover-tilt rest, painted-card hit, and raised-edge shadow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one desktop pass');
    await openDexExport(page);
    await waitPreviewReady(page);
    const foil = page.locator('[data-export-preview]');
    const hit = page.locator('[data-export-tilt-hit]');
    const box = await hit.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width * 0.88, box!.y + box!.height * 0.18, { steps: 8 });
    await expect.poll(async () => foil.getAttribute('data-export-orbit')).toBe('pointer');
    await expect.poll(async () => Math.abs(Number(await foil.getAttribute('data-tilt-y')))).toBeLessThan(12);
    await expect.poll(async () => Math.abs(Number(await foil.getAttribute('data-tilt-y')))).toBeGreaterThan(2);
    await expect.poll(async () => Number(await foil.getAttribute('data-shadow-x'))).toBeGreaterThan(0.25);
    const rightShadow = Number(await foil.getAttribute('data-shadow-x'));
    await page.mouse.move(box!.x + box!.width * 0.12, box!.y + box!.height * 0.5, { steps: 8 });
    await expect.poll(async () => Number(await foil.getAttribute('data-shadow-x'))).toBeLessThan(Math.min(0, rightShadow - 0.25));
    const painted = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('[data-export-preview]');
      if (!card) return null;
      const r = card.getBoundingClientRect();
      return { x: r.right - 3, y: r.top + r.height * 0.2 };
    });
    expect(painted).toBeTruthy();
    await page.mouse.move(painted!.x, painted!.y, { steps: 4 });
    await expect.poll(async () => foil.getAttribute('data-export-orbit')).toBe('pointer');
    await page.mouse.move(12, 12, { steps: 4 });
    await expect.poll(async () => foil.getAttribute('data-export-orbit')).not.toBe('pointer');
    await expect.poll(async () => foil.getAttribute('data-export-orbit'), { timeout: 3000 }).toBe('idle');
    await expect
      .poll(async () => {
        const x = Number(await foil.getAttribute('data-tilt-x'));
        const y = Number(await foil.getAttribute('data-tilt-y'));
        return Math.hypot(x, y);
      })
      .toBeGreaterThan(2);
    const after = Math.hypot(
      Number(await foil.getAttribute('data-tilt-x')),
      Number(await foil.getAttribute('data-tilt-y')),
    );
    expect(after, 'parked desktop idle hypot').toBeLessThanOrEqual(3.8);
  });

  test('keeps the tilted card AABB off the overlay corner', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one desktop pass');
    await openDexExport(page);
    await waitPreviewReady(page);
    const foil = page.locator('[data-export-preview]');
    const hit = page.locator('[data-export-tilt-hit]');
    const box = await hit.boundingBox();
    expect(box).toBeTruthy();
    const restCover = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('[data-export-preview]');
      const layer = document.querySelector<HTMLElement>('[data-export-preview-layer]');
      if (!card || !layer) return 0;
      const c = card.getBoundingClientRect();
      const l = layer.getBoundingClientRect();
      return Math.max(c.width / l.width, c.height / l.height);
    });
    expect(restCover).toBeGreaterThan(0.78);
    await page.mouse.move(box!.x + box!.width * 0.08, box!.y + box!.height * 0.92, { steps: 10 });
    await expect.poll(async () => foil.getAttribute('data-export-orbit')).toBe('pointer');
    await page.waitForTimeout(400);
    const gaps = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('[data-export-preview]');
      const layer = document.querySelector<HTMLElement>('[data-export-preview-layer]');
      if (!card || !layer) return { min: -1, view: -1 };
      const c = card.getBoundingClientRect();
      const l = layer.getBoundingClientRect();
      const layerGap = Math.min(c.left - l.left, l.right - c.right, c.top - l.top, l.bottom - c.bottom);
      const viewGap = Math.min(c.left, c.top, innerWidth - c.right, innerHeight - c.bottom);
      return { min: layerGap, view: viewGap, left: c.left - l.left, bottom: l.bottom - c.bottom };
    });
    expect(gaps.min, JSON.stringify(gaps)).toBeGreaterThanOrEqual(24);
    expect(gaps.view, JSON.stringify(gaps)).toBeGreaterThanOrEqual(24);
  });

  test('caps desktop hypot below a diamond shear', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one desktop pass');
    await openDexExport(page);
    await waitPreviewReady(page);
    const foil = page.locator('[data-export-preview]');
    const hit = page.locator('[data-export-tilt-hit]');
    const box = await hit.boundingBox();
    expect(box).toBeTruthy();
    const restCover = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('[data-export-preview]');
      const layer = document.querySelector<HTMLElement>('[data-export-preview-layer]');
      if (!card || !layer) return 0;
      const c = card.getBoundingClientRect();
      const l = layer.getBoundingClientRect();
      return Math.max(c.width / l.width, c.height / l.height);
    });
    expect(restCover).toBeGreaterThan(0.78);
    await page.mouse.move(box!.x + box!.width * 0.08, box!.y + box!.height * 0.92, { steps: 10 });
    await expect.poll(async () => foil.getAttribute('data-export-orbit')).toBe('pointer');
    await page.waitForTimeout(400);
    const hypot = Math.hypot(
      Number(await foil.getAttribute('data-tilt-x')),
      Number(await foil.getAttribute('data-tilt-y')),
    );
    expect(hypot, 'desktop peak hypot').toBeGreaterThan(2.4);
    expect(hypot, 'desktop peak hypot').toBeLessThanOrEqual(3.8);
  });

  test('paints rainbow holographic foil on the live overlay', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one desktop pass');
    await openDexExport(page);
    await waitPreviewReady(page);
    const foil = page.locator('[data-export-preview]');
    await expect.poll(async () => foil.getAttribute('data-foil-maps')).toBe('1');
    const hit = page.locator('[data-export-tilt-hit]');
    const box = await hit.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width * 0.82, box!.y + box!.height * 0.18, { steps: 10 });
    await expect.poll(async () => foil.getAttribute('data-export-orbit')).toBe('pointer');
    await page.waitForTimeout(500);
    const holo = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('[data-export-preview]');
      const layer = document.querySelector<HTMLElement>('[data-foil-layer="holographic"]');
      if (!card || !layer) return { ok: false, reason: 'missing' };
      const cs = getComputedStyle(layer);
      const mask = `${cs.getPropertyValue('-webkit-mask-image')} ${cs.maskImage}`.replace(/\s+/g, ' ').trim();
      const mode = `${cs.getPropertyValue('mask-mode')} ${cs.getPropertyValue('-webkit-mask-source-type')}`.trim();
      return {
        ok: true,
        mix: cs.mixBlendMode,
        opacity: Number(cs.opacity),
        mask,
        mode,
        bg: cs.backgroundImage,
        amount: Number(getComputedStyle(card).getPropertyValue('--foil-holographic')),
        foil: Number(card.getAttribute('data-foil-opacity')),
        w: layer.offsetWidth,
        h: layer.offsetHeight,
      };
    });
    expect(holo.ok, JSON.stringify(holo)).toBe(true);
    expect(holo.mix, JSON.stringify(holo)).toBe('multiply');
    expect(holo.opacity, JSON.stringify(holo)).toBeGreaterThan(0.15);
    expect(holo.amount, JSON.stringify(holo)).toBeCloseTo(0.52, 2);
    expect(holo.foil, JSON.stringify(holo)).toBeGreaterThan(0.2);
    expect(holo.w, JSON.stringify(holo)).toBeGreaterThan(100);
    expect(holo.h, JSON.stringify(holo)).toBeGreaterThan(100);
    expect(holo.bg, JSON.stringify(holo)).toMatch(/repeating-linear-gradient/);
    expect(holo.mask, JSON.stringify(holo)).toMatch(/url\(/);
    const shadow = await hit.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        box: cs.boxShadow,
        x: Number(el.getAttribute('data-shadow-x') || 0),
        opacity: Number(el.getAttribute('data-shadow-opacity') || 0),
      };
    });
    expect(shadow.box, JSON.stringify(shadow)).not.toBe('none');
    expect(shadow.box.length, JSON.stringify(shadow)).toBeGreaterThan(24);
    expect(shadow.opacity, JSON.stringify(shadow)).toBeGreaterThan(0.2);
  });
});
