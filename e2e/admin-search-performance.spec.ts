import { expect, test } from '@playwright/test';

function searchPanel(page: import('@playwright/test').Page) {
  return page.locator('section', { has: page.getByRole('heading', { name: 'Search intelligence' }) });
}

test.describe('admin search performance', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?admin&demo');
    await expect(page.getByRole('heading', { name: /Analytics/ })).toBeVisible();
  });

  test('shows one evidence-backed focus with engine-specific page detail', async ({ page }) => {
    const panel = searchPanel(page);
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('article', { name: 'Google ready' })).toBeVisible();
    await expect(panel.getByRole('article', { name: 'Bing ready' })).toBeVisible();
    await expect(panel.getByText('usual 2–3 day lag')).toBeVisible();
    await expect(panel.getByText('Conversion signal not connected')).toBeVisible();
    await expect(panel.getByTestId('search-primary-focus')).toContainText('/custom-gym-leader');
    await expect(panel.getByTestId('search-primary-focus')).toContainText('Single next action');
    await expect(panel.getByText('Current release')).toBeVisible();
    await expect(panel.getByText(/Deployment history is not connected/)).toBeVisible();

    await expect(panel.getByTestId('search-page-home')).toContainText('Homepage');
    await expect(panel.getByTestId('search-page-pokedex-builder')).toContainText('pokemon team builder');
    await expect(panel.getByTestId('search-page-custom-gym-leader')).toContainText('pokemon gym leader maker');
    await expect(panel.getByText('No SEO changes are recorded.')).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});

