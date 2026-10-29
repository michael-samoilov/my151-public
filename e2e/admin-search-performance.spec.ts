import { openAdmin } from './admin-ready';
import { expect, test } from '@playwright/test';

function searchPanel(page: import('@playwright/test').Page) {
  return page.getByTestId('search-performance');
}

test.describe('admin search performance', () => {
  test.beforeEach(async ({ page }) => {
    await openAdmin(page, '/?admin&demo');
    await expect(page.getByRole('heading', { name: /Analytics/ })).toBeVisible();
  });

  test('keeps search separate from Suite and shows provider and page data', { tag: '@viewport' }, async ({ page }) => {
    const panel = searchPanel(page);
    await expect(panel).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Admin section' }).getByRole('button', { name: 'Search' }).click();
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(panel.getByText('Google ready')).toBeVisible();
    await expect(panel.getByText('Bing ready')).toBeVisible();
    await expect(panel.getByText(/^Current \w{3} \d+–\w{3} \d+$/)).toBeVisible();
    await expect(panel.getByText(/^Through /)).toBeVisible();
    await expect(panel.getByText('Previous —', { exact: true })).toBeVisible();
    await expect(panel.locator('[data-kpi="clicks"]')).toContainText('—');
    await expect(panel.getByText('28d')).toHaveCount(0);
    await expect(panel.getByText('Not final yet: Sep 22–Sep 23', { exact: true })).toBeVisible();

    await expect(panel.getByTestId('search-page-home')).toContainText('Homepage');
    await expect(panel.getByTestId('search-page-pokedex-builder')).toContainText('pokedex builder');
    await expect(panel.getByTestId('search-page-custom-gym-leader')).toContainText('gym leader maker');
    const picker = panel.getByTestId('search-page-favorite-pokemon-picker');
    await expect(picker).toContainText('Favorite Pokémon Picker');
    await expect(picker).toContainText('favorite pokemon picker');
    expect(await picker.getByRole('heading').evaluate((h) => h.scrollWidth <= h.clientWidth)).toBe(true);
    await expect(panel.getByTestId('search-page-favorite-pokemon-by-type')).toHaveCount(0);

    await panel.getByRole('group', { name: 'Search provider' }).getByRole('button', { name: 'Bing' }).click();
    await expect(panel.getByText('make a pokedex')).toBeVisible();

    const ribbon = page.getByRole('group', { name: 'Date range' });
    await ribbon.getByRole('button', { name: '24h' }).click();
    await expect(panel.getByText('Current —', { exact: true })).toBeVisible();
    await expect(panel.getByText(/^Not final yet/)).toHaveCount(0);
    await panel.getByRole('group', { name: 'Search provider' }).getByRole('button', { name: 'Google' }).click();
    await expect(panel.getByText(/^Current \w{3} \d+, \d+ [AP]M–/)).toBeVisible();
    await ribbon.getByRole('button', { name: '7d' }).click();
    await expect(panel.getByText(/^Previous \w{3} \d+–\w{3} \d+$/)).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});

