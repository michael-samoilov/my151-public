import { expect, test, type Locator, type Page } from '@playwright/test';

async function setRange(page: Page, testId: string, value: string): Promise<void> {
  await page.locator(`[data-foil-slider="${testId}"]`).evaluate((el, next) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function foilVar(foil: Locator, name: string): Promise<string> {
  return foil.evaluate((el, key) => getComputedStyle(el).getPropertyValue(key).trim(), name);
}

test.describe('export foil workshop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('keeps only holo, glare, and shadow dials', async ({ page }) => {
    await page.goto('/foil-workshop');
    await expect(page.locator('[data-foil-workshop]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Export foil workshop' })).toBeVisible();

    const img = page.locator('[data-export-tilt-hit] img');
    await img.waitFor({ timeout: 60_000 });
    const box = await img.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(80);
    const foil = page.locator('[data-export-preview]');
    await expect
      .poll(async () => foil.getAttribute('data-foil-maps'), { timeout: 20_000 })
      .toBe('1');
    await expect(page.locator('[data-foil-layer="holographic"]')).toHaveCount(1);
    await expect(page.locator('[data-foil-control]')).toHaveCount(1);
    await expect(page.locator('[data-foil-slider="holographic"]')).toBeVisible();
    await expect(page.locator('[data-foil-slider="glareIntensity"]')).toBeVisible();
    await expect(page.locator('[data-workshop-shadow-toggle]')).toBeVisible();
    await expect(page.locator('[data-foil-slider="shadowBlur"]')).toBeVisible();
    await expect(page.locator('[data-hover-tilt-select]')).toHaveCount(0);
    await expect(page.locator('[data-hover-tilt-mask]')).toHaveCount(0);
    await expect(page.locator('[data-foil-slider="sparkleIntensity"]')).toHaveCount(0);
    await expect(page.locator('[data-foil-slider="parallaxPx"]')).toHaveCount(0);
    await expect(page.locator('[data-foil-slider="tiltFactor"]')).toHaveCount(0);
    await expect(page.locator('[data-foil-slider="idleTilt"]')).toHaveCount(0);
    await expect(page.locator('[data-workshop-dark-card-toggle]')).toHaveCount(0);
    await expect
      .poll(async () => foilVar(foil, '--foil-holographic'))
      .toBe('1.000');
    await expect
      .poll(async () => foilVar(foil, '--hover-tilt-glare-intensity'))
      .toBe('0.600');
    await expect
      .poll(async () => foilVar(foil, '--foil-holo-blend'))
      .toBe('color-dodge');
    await expect
      .poll(async () => {
        const x = Number(await foil.getAttribute('data-tilt-x'));
        const y = Number(await foil.getAttribute('data-tilt-y'));
        return Math.hypot(x, y);
      }, { timeout: 8000 })
      .toBeGreaterThan(3.5);

    await setRange(page, 'holographic', '0.91');
    await expect.poll(async () => foilVar(foil, '--foil-holographic')).toBe('0.910');
  });

  test('glare and shadow write through with fixed credit-card blends', async ({ page }) => {
    await page.goto('/foil-workshop');
    await expect(page.locator('[data-foil-workshop]')).toBeVisible();
    const img = page.locator('[data-export-tilt-hit] img');
    await img.waitFor({ timeout: 60_000 });
    const foil = page.locator('[data-export-preview]');
    await expect
      .poll(async () => foil.getAttribute('data-foil-maps'), { timeout: 20_000 })
      .toBe('1');

    await setRange(page, 'glareIntensity', '0.91');
    await expect.poll(async () => foilVar(foil, '--hover-tilt-glare-intensity')).toBe('0.910');

    await page.locator('[data-workshop-shadow-toggle]').uncheck();
    await expect(foil).toHaveAttribute('data-hover-tilt-shadow', '0');
    await page.locator('[data-workshop-shadow-toggle]').check();
    await expect(foil).toHaveAttribute('data-hover-tilt-shadow', '1');
    await setRange(page, 'shadowBlur', '32');
    await expect.poll(async () => foilVar(foil, '--hover-tilt-shadow-blur')).toBe('32');
    const shadowAt32 = await page.locator('[data-export-foil-lift]').evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadowAt32).not.toBe('none');
    await setRange(page, 'shadowBlur', '8');
    await expect.poll(async () => foilVar(foil, '--hover-tilt-shadow-blur')).toBe('8');
    await expect.poll(async () => {
      const next = await page.locator('[data-export-foil-lift]').evaluate((el) => getComputedStyle(el).boxShadow);
      return next !== shadowAt32 && next !== 'none';
    }).toBe(true);

    await expect.poll(async () => foilVar(foil, '--foil-holo-blend')).toBe('color-dodge');
    await expect.poll(async () => foilVar(foil, '--hover-tilt-blend-mode')).toBe('overlay');
  });

  test('overlay scrim matches the export backdrop', async ({ page }) => {
    await page.goto('/foil-workshop');
    const img = page.locator('[data-export-tilt-hit] img');
    await img.waitFor({ timeout: 60_000 });

    const pageBg = await page.locator('[data-workshop-stage-page]').evaluate((el) =>
      getComputedStyle(el).backgroundColor,
    );
    expect(pageBg, 'stage page must be the app canvas, not black').toBe('rgb(247, 247, 248)');

    const overlay = await page.locator('[data-workshop-overlay]').evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        bg: style.backgroundColor,
        blur: style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter'),
      };
    });
    expect(overlay.blur).toMatch(/blur\(/);
    expect(overlay.bg).not.toBe('rgb(0, 0, 0)');
    expect(overlay.bg).toMatch(/0\.5/);
  });

  test('opposite corners raise opposite corners', async ({ page }) => {
    await page.goto('/foil-workshop');
    const img = page.locator('[data-export-tilt-hit] img');
    await img.waitFor({ timeout: 60_000 });
    const foil = page.locator('[data-export-preview]');
    await expect.poll(async () => foil.getAttribute('data-foil-maps'), { timeout: 20_000 }).toBe('1');
    const lift = page.locator('[data-export-foil-lift]');
    const box = await lift.boundingBox();
    expect(box, 'workshop lift has no box').toBeTruthy();
    const tl = { x: box!.x + box!.width * 0.18, y: box!.y + box!.height * 0.18 };
    const br = { x: box!.x + box!.width * 0.82, y: box!.y + box!.height * 0.82 };
    await page.mouse.move(tl.x, tl.y);
    await page.mouse.move(tl.x + 28, tl.y + 8, { steps: 6 });
    await expect.poll(async () => foil.getAttribute('data-export-orbit')).toBe('pointer');
    await expect.poll(async () => {
      const x = Number(await foil.getAttribute('data-tilt-x'));
      const y = Number(await foil.getAttribute('data-tilt-y'));
      return Number.isFinite(x) && Number.isFinite(y) && Math.hypot(x, y) >= 1;
    }).toBe(true);
    const tlPose = {
      x: Number(await foil.getAttribute('data-tilt-x')),
      y: Number(await foil.getAttribute('data-tilt-y')),
    };
    expect(tlPose.x, 'top-left rotateX').not.toBe(0);
    expect(tlPose.y, 'top-left rotateY').not.toBe(0);
    await page.mouse.move(br.x, br.y, { steps: 12 });
    await expect.poll(async () => {
      const x = Number(await foil.getAttribute('data-tilt-x'));
      const y = Number(await foil.getAttribute('data-tilt-y'));
      return Math.sign(x) === -Math.sign(tlPose.x) && Math.sign(y) === -Math.sign(tlPose.y) ? 'opp' : `${x},${y}`;
    }, { timeout: 4000 }).toBe('opp');
  });

  test('sits flat at rest and pops only while tilting', async ({ page }) => {
    await page.goto('/foil-workshop');
    const img = page.locator('[data-export-tilt-hit] img');
    await img.waitFor({ timeout: 60_000 });
    const foil = page.locator('[data-export-preview]');
    await expect.poll(async () => foil.getAttribute('data-foil-maps'), { timeout: 20_000 }).toBe('1');
    await expect.poll(async () => foil.getAttribute('data-tilt-active')).toBe('1');
    const lift = page.locator('[data-export-foil-lift]');
    await expect.poll(async () => foil.getAttribute('data-tilt-scale')).toBe('1.150');
    await expect.poll(async () => lift.evaluate((el) => getComputedStyle(el).transform)).not.toBe('none');
    const popped = await lift.boundingBox();
    if ((await foil.getAttribute('data-paused')) !== '1') {
      await page.evaluate(() => {
        const hit = document.querySelector('[data-export-tilt-hit]');
        if (!(hit instanceof HTMLElement)) return;
        const r = hit.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const down = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', buttons: 1 };
        hit.dispatchEvent(new PointerEvent('pointerdown', down));
        document.dispatchEvent(new PointerEvent('pointermove', { ...down, clientX: x + 48, clientY: y - 32 }));
        hit.dispatchEvent(new PointerEvent('pointerup', { ...down, clientX: x + 48, clientY: y - 32, buttons: 0 }));
      });
    }
    await expect.poll(async () => foil.getAttribute('data-paused')).toBe('1');
    await expect.poll(async () => foil.getAttribute('data-tilt-active')).toBe('0');
    // Flat at rest: a uniform scale-down from the popped layout, no rotation.
    await expect
      .poll(async () => lift.evaluate((el) => getComputedStyle(el).transform))
      .toMatch(/^matrix\(([\d.]+), 0, 0, \1, 0, 0\)$/);
    await expect.poll(async () => foil.getAttribute('data-tilt-scale')).toBe('1');
    const flat = await lift.boundingBox();
    expect(popped && flat && popped.width > flat.width * 1.08, 'tilt scale paints larger than rest').toBeTruthy();
    await expect
      .poll(async () => lift.evaluate((el) => getComputedStyle(el).boxShadow))
      .toMatch(/rgba?\(0,\s*0,\s*0,\s*0\)|rgb\(0,\s*0,\s*0\)\s*\/\s*0|none/);
    await page.evaluate(() => {
      const hit = document.querySelector('[data-export-tilt-hit]');
      if (!(hit instanceof HTMLElement)) return;
      const r = hit.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse' };
      hit.dispatchEvent(new PointerEvent('pointerdown', opts));
      hit.dispatchEvent(new PointerEvent('pointerup', opts));
    });
    await expect.poll(async () => foil.getAttribute('data-paused')).toBe('0');
    await expect.poll(async () => foil.getAttribute('data-tilt-active')).toBe('1');
    await expect.poll(async () => foil.getAttribute('data-tilt-scale')).toBe('1.150');
  });
});

test.describe('export foil workshop on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the tilting card has a real height above the controls', async ({ page }) => {
    await page.goto('/foil-workshop');
    const img = page.locator('[data-export-tilt-hit] img');
    await img.waitFor({ timeout: 60_000 });
    const box = await img.boundingBox();
    expect(box?.height ?? 0, 'workshop card collapsed on a phone').toBeGreaterThan(80);
    const hit = await page.locator('[data-export-tilt-hit]').boundingBox();
    expect(hit?.height ?? 0).toBeGreaterThan(80);
  });
});
