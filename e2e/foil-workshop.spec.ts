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
    await expect(page.locator('[data-foil-layer]')).toHaveCount(5);
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
