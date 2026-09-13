import { test, expect } from '@playwright/test';

/**
 * The admin Cross-tool tile, in demo mode so CI does not need a token.
 * Locks the methodology the tile is supposed to show: percents, not
 * "dex-first / all dex users", and a Venn per arrival era.
 */
test.describe('admin cross-tool tile', () => {
  test('demo dashboard shows opportunity percents and two era Venns', async ({ page }) => {
    await page.goto('/?admin&demo');
    const tile = page.locator('section', { has: page.getByRole('heading', { name: /Cross-tool/ }) });
    await expect(tile.getByText('Dex → League')).toBeVisible();
    await expect(tile.getByText('8%')).toBeVisible();
    await expect(tile.getByText('4 / 50')).toBeVisible();
    await expect(tile.getByText('League has a dex')).toBeVisible();
    await expect(tile.getByText('80%')).toBeVisible();
    await expect(tile.getByText('League ⊂ dex')).toBeVisible();
    await expect(tile.getByText('75%')).toBeVisible();
    await expect(tile.getByText(/of dex users active after 8 Sep 2026/)).toBeVisible();
    await expect(tile.getByText('Arrived before 8 Sep 2026')).toBeVisible();
    await expect(tile.getByText('Arrived after 8 Sep 2026')).toBeVisible();
    await expect(tile.locator('svg[role="img"]')).toHaveCount(2);
  });
});
