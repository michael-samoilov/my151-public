import { expect, test } from '@playwright/test';

function searchPanel(page: import('@playwright/test').Page) {
  return page.locator('section', { has: page.getByRole('heading', { name: 'Search performance' }) });
}

test.describe('admin search performance', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?admin&demo');
    await expect(page.getByRole('heading', { name: /Analytics/ })).toBeVisible();
  });

  test('shows exact Google metrics and can switch range and provider', async ({ page }) => {
    const panel = searchPanel(page);
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Google ready')).toBeVisible();
    await expect(panel.getByText('Bing ready')).toBeVisible();
    await expect(panel.getByText('Search clicks')).toBeVisible();
    await expect(panel.getByText('Top pages · 28d')).toBeVisible();
    await expect(panel.getByText('Top queries · 28d')).toBeVisible();
    await expect(panel.getByRole('img', { name: /Daily search impressions/ })).toBeVisible();

    await panel.getByRole('group', { name: 'Search date range' }).getByRole('button', { name: '7d' }).click();
    await expect(panel.getByText('7 days')).toBeVisible();

    await panel.getByRole('group', { name: 'Search provider' }).getByRole('button', { name: 'Bing' }).click();
    await expect(panel.getByText(/Bing page and query detail/)).toBeVisible();
    await expect(panel.getByText('make a gym leader team')).toBeVisible();
  });
});

