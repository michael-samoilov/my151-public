import { expect, test } from './support/test';

const TILES = '[data-row-cell]';

test.describe('browser result grid windowing', { tag: '@viewport' }, () => {
  test('a generation filter fills the grid without scrolling', async ({ page }) => {
    await page.goto('/pokedex-builder?lang=en');
    await page.locator('[data-add-slot]').first().click();
    await expect(page.locator(TILES).first()).toBeVisible();

    await page.getByRole('button', { name: /^Clear$/ }).first().click();
    await expect(page.locator('[data-result-count]').first()).toHaveAttribute(
      'data-result-count',
      '1126',
    );
    await expect.poll(() => page.locator(TILES).count()).toBeGreaterThan(0);

    await page.getByRole('button', { name: /^Gen$/ }).first().click();
    await page.locator('.grid.grid-cols-3 button').nth(4).click();

    await expect(page.locator('[data-result-count]').first()).toHaveAttribute(
      'data-result-count',
      '165',
    );
    await expect
      .poll(() => page.locator(TILES).count(), {
        message: 'grid stayed empty after the generation filter',
      })
      .toBeGreaterThan(0);
  });

  test('windowing keeps the list short but its scroll height honest', async ({ page }) => {
    await page.goto('/pokedex-builder?lang=en');
    await page.locator('[data-add-slot]').first().click();
    await page.getByRole('button', { name: /^Clear$/ }).first().click();
    await expect(page.locator('[data-result-count]').first()).toHaveAttribute(
      'data-result-count',
      '1126',
    );
    await expect.poll(() => page.locator(TILES).count()).toBeGreaterThan(0);

    const built = await page.locator(TILES).count();
    expect(built, 'the whole dex should not be built at once').toBeLessThan(400);
  });
});
