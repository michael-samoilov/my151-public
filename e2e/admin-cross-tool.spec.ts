import { test, expect } from '@playwright/test';

/**
 * The admin Cross-tool tile, in demo mode so CI does not need a token.
 * Locks the methodology the tile is supposed to show: percents, not
 * "dex-first / all dex users", and a Venn per arrival era. Labels stay
 * tight enough for a 390px phone: one shared legend, short era captions,
 * counts on the circles.
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
    await expect(tile.getByText('Only dex Pokémon')).toBeVisible();
    await expect(tile.getByText('75%')).toBeVisible();
    await expect(tile.getByText('Before 8 Sep')).toBeVisible();
    await expect(tile.getByText('After 8 Sep')).toBeVisible();
    await expect(tile.getByText('Arrived before 8 Sep 2026')).toHaveCount(0);
    await expect(tile.getByTestId('cross-tool-legend')).toBeVisible();
    await expect(tile.getByTestId('cross-tool-legend').getByText('Dex', { exact: true })).toBeVisible();
    await expect(tile.getByTestId('cross-tool-legend').getByText('League', { exact: true })).toBeVisible();
    await expect(tile.getByTestId('cross-tool-legend').getByText('both', { exact: true })).toBeVisible();
    await expect(tile.locator('svg[role="img"]')).toHaveCount(2);
    await expect(tile.locator('svg text', { hasText: '336' })).toBeVisible();
    await expect(tile.getByText(/of dex users active after 8 Sep 2026/)).toHaveCount(0);
  });
});
