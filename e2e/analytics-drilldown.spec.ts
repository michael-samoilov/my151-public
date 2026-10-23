import { expect, test } from '@playwright/test';
import { seedDex, TUNE_URL } from './support/dexSeed';

async function openAnalytics(page: import('@playwright/test').Page) {
  await page.goto(TUNE_URL);
  await seedDex(page);
  await page.locator('[data-nav="analytics"]').click();
  await expect(page.getByRole('heading', { name: 'Generation Origin' })).toBeVisible();
}

function chartRow(page: import('@playwright/test').Page, label: string) {
  return page.locator('svg > g.cursor-pointer:visible').filter({ has: page.locator(`text:text-is("${label}")`) }).first();
}

function drillTitle(page: import('@playwright/test').Page, title: string) {
  return page.locator('span.font-semibold:visible').filter({ hasText: new RegExp(`^${title}$`) });
}

test.describe('analytics drill-down', () => {
  test('a generation row opens that generation', async ({ page }) => {
    await openAnalytics(page);
    await page.getByRole('img', { name: 'Gen I', exact: true }).click();
    await expect(drillTitle(page, 'Generation 1')).toBeVisible();
  });

  test('a body-shape row opens that shape', async ({ page }) => {
    await openAnalytics(page);
    await page.getByRole('heading', { name: 'Body Shape' }).scrollIntoViewIfNeeded();
    await chartRow(page, 'QUADRUPED').click();
    await expect(drillTitle(page, 'Quadruped Shape')).toBeVisible();
  });

  test('a type row opens that type', async ({ page }) => {
    await openAnalytics(page);
    await chartRow(page, 'POISON').click();
    await expect(drillTitle(page, 'Poison Type')).toBeVisible();
  });
});
