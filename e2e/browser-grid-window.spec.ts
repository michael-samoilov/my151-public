import { expect, test } from '@playwright/test';

/**
 * The result grid renders only the rows near the viewport, so a grid's window
 * has to be recomputed when its *position* in the list changes, not only when
 * its row count does. Applying a generation filter is the case that catches
 * this: the subgroup blocks are keyed by label, so React reuses the grid that
 * was already showing that generation far down the list — same rows, same tile
 * size, new position. A window computed for the old position leaves the list
 * blank until the reader scrolls, which is what this guards.
 */

/** Tiles currently built, regardless of what overlays them. */
const TILES = '[data-row-cell]';

test.describe('browser result grid windowing', () => {
  test('a generation filter fills the grid without scrolling', async ({ page }) => {
    await page.goto('/?lang=en');
    await page.locator('[data-add-slot]').first().click();
    await expect(page.locator(TILES).first()).toBeVisible();

    // Start from the whole dex, so the filtered generation's grid begins far
    // enough down the list that its window is legitimately empty.
    await page.getByRole('button', { name: /^Clear$/ }).first().click();
    await expect(page.locator('[data-result-count]').first()).toHaveAttribute(
      'data-result-count',
      '1126',
    );
    await expect.poll(() => page.locator(TILES).count()).toBeGreaterThan(0);

    await page.getByRole('button', { name: /^Gen$/ }).first().click();
    await page.locator('.grid.grid-cols-3 button').nth(4).click(); // Gen 5

    // The count settles first; the grid must not lag behind it.
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
    await page.goto('/?lang=en');
    await page.locator('[data-add-slot]').first().click();
    await page.getByRole('button', { name: /^Clear$/ }).first().click();
    await expect(page.locator('[data-result-count]').first()).toHaveAttribute(
      'data-result-count',
      '1126',
    );
    await expect.poll(() => page.locator(TILES).count()).toBeGreaterThan(0);

    // 1,126 results span far more tiles than any viewport can show.
    const built = await page.locator(TILES).count();
    expect(built, 'the whole dex should not be built at once').toBeLessThan(400);
  });
});
