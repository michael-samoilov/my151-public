import { expect, test } from '@playwright/test';

test('desktop picker stays over the table without changing its width', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.goto('/favorite-pokemon-by-type.html');
  const table = page.getByTestId('favorites-grid-scroll');
  const baseWidth = await table.evaluate((el) => el.getBoundingClientRect().width);
  const checkBounds = async (expectedWidth?: number) => {
    const bounds = await page.evaluate(() => {
      const table = document.querySelector('[data-testid="favorites-grid-scroll"]')!.parentElement!.getBoundingClientRect();
      const picker = document.querySelector('[data-testid="favorites-picker"]')!.getBoundingClientRect();
      return { table: { left: table.left, right: table.right, top: table.top, bottom: table.bottom },
        picker: { left: picker.left, right: picker.right, top: picker.top, bottom: picker.bottom },
        viewport: { width: innerWidth, height: innerHeight } };
    });
    expect(bounds.picker.left).toBeGreaterThanOrEqual(bounds.table.left - 1);
    expect(bounds.picker.right).toBeLessThanOrEqual(bounds.table.right + 1);
    expect(bounds.picker.top).toBeGreaterThanOrEqual(bounds.table.top - 1);
    expect(bounds.picker.bottom).toBeLessThanOrEqual(bounds.table.bottom + 1);
    expect(bounds.picker.left).toBeGreaterThanOrEqual(-1);
    expect(bounds.picker.right).toBeLessThanOrEqual(bounds.viewport.width + 1);
    expect(bounds.picker.top).toBeGreaterThanOrEqual(-1);
    expect(bounds.picker.bottom).toBeLessThanOrEqual(bounds.viewport.height + 1);
    if (expectedWidth != null) {
      expect(await table.evaluate((el) => el.getBoundingClientRect().width)).toBeCloseTo(expectedWidth, 0);
    }
    return bounds.picker.right - bounds.picker.left;
  };

  await page.getByTestId('favorites-cell-normal-1').click();
  const denseWidth = await checkBounds(baseWidth);
  await page.getByRole('button', { name: 'Close picker' }).click();
  await page.getByTestId('favorites-cell-legendary-1').click();
  const sparseWidth = await checkBounds(baseWidth);
  expect(sparseWidth).toBeLessThan(denseWidth);
  await page.getByRole('button', { name: 'Close picker' }).click();
  await page.getByTestId('favorites-cell-favorite-9').click();
  await checkBounds(baseWidth);
  await page.evaluate(() => window.scrollBy(0, -100));
  await checkBounds(baseWidth);
  await page.setViewportSize({ width: 1050, height: 620 });
  await checkBounds();
});

test('type toggle persists across pickers and reloads', async ({ page }) => {
  await page.goto('/favorite-pokemon-by-type.html');
  await page.getByTestId('favorites-cell-fire-1').click();
  let toggle = page.getByTestId('favorites-type-toggle');
  await expect(toggle).toHaveText('Show Types');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveText('Hide Types');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await page.getByTestId('favorites-type-icon').count()).toBeGreaterThan(0);
  expect(await page.evaluate(() => localStorage.getItem('personal-151-favorites-show-types-v1'))).toBe('1');

  await page.getByRole('button', { name: 'Close picker' }).click();
  await page.getByTestId('favorites-cell-bug-6').click();
  toggle = page.getByTestId('favorites-type-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await page.getByTestId('favorites-type-icon').count()).toBeGreaterThan(0);
  await page.reload();
  await page.getByTestId('favorites-cell-bug-6').click();
  toggle = page.getByTestId('favorites-type-toggle');
  await expect(toggle).toHaveText('Hide Types');
  await toggle.click();
  await expect(toggle).toHaveText('Show Types');
  expect(await page.evaluate(() => localStorage.getItem('personal-151-favorites-show-types-v1'))).toBe('0');
});
