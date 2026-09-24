import { expect, test } from '@playwright/test';

function searchPanel(page: import('@playwright/test').Page) {
  return page.getByTestId('search-performance');
}

test.describe('admin search performance', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?admin&demo');
    await expect(page.getByRole('heading', { name: /Analytics/ })).toBeVisible();
  });

  test('keeps search separate from Suite and shows provider and page data', async ({ page }) => {
    const panel = searchPanel(page);
    await expect(panel).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Admin section' }).getByRole('button', { name: 'Search' }).click();
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(panel.getByText('Google ready')).toBeVisible();
    await expect(panel.getByText('Bing ready')).toBeVisible();
    await expect(panel.getByText(/^Current /)).toBeVisible();
    await expect(panel.getByText(/^Previous /)).toBeVisible();
    await expect(panel.getByText(/^Through /)).toBeVisible();
    await expect(panel.getByTestId('search-page-home')).toContainText('Homepage');
    await expect(panel.getByTestId('search-page-pokedex-builder')).toContainText('pokedex builder');
    await expect(panel.getByTestId('search-page-custom-gym-leader')).toContainText('gym leader maker');

    await panel.getByRole('group', { name: 'Search provider' }).getByRole('button', { name: 'Bing' }).click();
    await expect(panel.getByText('make a pokedex')).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});

