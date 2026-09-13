import { test, expect } from '@playwright/test';

/**
 * The admin Cross-tool tile, in demo mode so CI does not need a token.
 * Locks opportunity percents and the post-launch Venn. The pre-launch
 * cohort is omitted: one tool is not cross-tool mix. Inclusive circle
 * sizes sit in the legend. Exclusive counts sit on the diagram.
 */
test.describe('admin cross-tool tile', () => {
  test('demo dashboard shows opportunity percents and the post-launch Venn', async ({ page }) => {
    await page.goto('/?admin&demo');
    const tile = page.locator('section', { has: page.getByRole('heading', { name: /Cross-tool/ }) });
    await expect(tile.getByText('Dex → League')).toBeVisible();
    await expect(tile.getByText('8%')).toBeVisible();
    await expect(tile.getByText('4 / 50')).toBeVisible();
    await expect(tile.getByText('League has a dex')).toBeVisible();
    await expect(tile.getByText('80%')).toBeVisible();
    await expect(tile.getByText('Only dex Pokémon')).toBeVisible();
    await expect(tile.getByText('75%')).toBeVisible();
    await expect(tile.getByText('After 8 Sep')).toBeVisible();
    await expect(tile.getByText('Before 8 Sep')).toHaveCount(0);
    const legend = tile.getByTestId('cross-tool-legend');
    await expect(legend).toBeVisible();
    await expect(legend.getByText('Dex 49')).toBeVisible();
    await expect(legend.getByText('League 2')).toBeVisible();
    await expect(legend.getByText('both', { exact: true })).toHaveCount(0);
    await expect(tile.locator('svg[role="img"]')).toHaveCount(1);
    await expect(tile.locator('svg text', { hasText: '48' })).toBeVisible();
    await expect(tile.locator('svg text', { hasText: '336' })).toHaveCount(0);
  });
});
