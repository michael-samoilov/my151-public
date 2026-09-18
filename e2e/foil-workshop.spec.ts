import { expect, test } from '@playwright/test';

test.describe('export foil workshop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('renders a tilting league card and solos a lighting layer', async ({ page }) => {
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
    await expect(page.locator('[data-foil-layer]')).toHaveCount(4);
    await expect(page.locator('[data-foil-control]')).toHaveCount(10);
    await expect
      .poll(
        async () => {
          const x = Number(await foil.getAttribute('data-tilt-x'));
          const y = Number(await foil.getAttribute('data-tilt-y'));
          return Math.hypot(x, y);
        },
        { timeout: 8000 },
      )
      .toBeGreaterThan(3.5);

    await page.locator('[data-foil-solo="holographic"]').click();
    await expect(page.locator('[data-foil-layer]')).toHaveCount(1);
    await expect(page.locator('[data-foil-layer="holographic"]')).toHaveCount(1);
    await expect
      .poll(async () =>
        foil.evaluate((el) => getComputedStyle(el).getPropertyValue('--foil-holographic').trim()),
      )
      .not.toBe('0');
    await expect
      .poll(async () =>
        foil.evaluate((el) => getComputedStyle(el).getPropertyValue('--foil-bloom').trim()),
      )
      .toBe('0.000');

    await page.locator('[data-foil-slider="holographic"]').evaluate((el) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, '0.91');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect
      .poll(async () =>
        foil.evaluate((el) => getComputedStyle(el).getPropertyValue('--foil-holographic').trim()),
      )
      .toBe('0.910');
  });

  test('lists glare masks and applies one to the shared preview', async ({ page }) => {
    await page.goto('/foil-workshop');
    await expect(page.locator('[data-foil-workshop]')).toBeVisible();
    await expect(page.locator('[data-hover-tilt-mask]')).toHaveCount(6);
    const maskList = page.locator('[data-hover-tilt-masks]');
    await expect(maskList.getByText('Primary type icon', { exact: true })).toBeVisible();
    await expect(maskList.getByText('my151.app wordmark', { exact: true })).toBeVisible();
    await expect(maskList.getByText('Pokémon-card sparkles', { exact: true })).toBeVisible();
    await expect(maskList.getByText('Poké Ball tile', { exact: true })).toBeVisible();
    await expect(maskList.getByText('National Dex number', { exact: true })).toBeVisible();

    const img = page.locator('[data-export-tilt-hit] img');
    await img.waitFor({ timeout: 60_000 });
    const foil = page.locator('[data-export-preview]');
    await expect(page.locator('[data-hover-tilt-layer]')).toHaveCount(3);
    await expect
      .poll(async () => foil.getAttribute('data-hover-tilt'))
      .toBe('1');

    await page.locator('[data-hover-tilt-mask="wordmark"]').click();
    await expect(foil).toHaveAttribute('data-hover-tilt-glare-mask', 'wordmark');
    await expect
      .poll(async () =>
        foil.evaluate((el) => getComputedStyle(el).getPropertyValue('--hover-tilt-glare-mask').trim()),
      )
      .toContain('svg+xml');
    const wordmark = await foil.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--hover-tilt-glare-mask'),
    );
    expect(decodeURIComponent(wordmark)).toContain('my151.app');

    await page.locator('[data-hover-tilt-mask="typeIcon"]').click();
    await expect(foil).toHaveAttribute('data-hover-tilt-glare-mask', 'typeIcon');
    await expect
      .poll(async () =>
        foil.evaluate((el) => getComputedStyle(el).getPropertyValue('--hover-tilt-glare-mask').trim()),
      )
      .toContain('/sprites/types/glyph/');

    await page.locator('[data-foil-slider="glareIntensity"]').evaluate((el) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, '0.91');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect
      .poll(async () =>
        foil.evaluate((el) => getComputedStyle(el).getPropertyValue('--hover-tilt-glare-intensity').trim()),
      )
      .toBe('0.910');
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
