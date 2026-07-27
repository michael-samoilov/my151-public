import { expect, test } from '@playwright/test';
import { seedDex, TUNE_URL } from './support/milestoneHeader';

/**
 * Clicking a ButterflyChart row opens the matching drill-down. This used to work
 * by handing the click the row's *display label* and parsing the datum back out
 * of it — `parseInt(label.replace('Gen ', ''))` for generations, a
 * label→shape reverse Map for body shapes, `label.toLowerCase()` for types. Rows
 * now carry an opaque `key`, so these assert the click still resolves to the
 * right segment via the key rather than via the rendered text.
 */

async function openAnalytics(page: import('@playwright/test').Page) {
  await page.goto(TUNE_URL);
  await seedDex(page);
  await page.locator('[data-nav="analytics"]').click();
  await expect(page.getByRole('heading', { name: 'Generation Origin' })).toBeVisible();
}

/** Charts are SVG; a row's clickable <g> is found via its label text. */
function chartRow(page: import('@playwright/test').Page, label: string) {
  return page.locator('svg g').filter({ has: page.locator(`text:text-is("${label}")`) }).first();
}

/**
 * The drill-down's own title span. Scoped to visible spans because some of these
 * strings ("Generation 1") also appear as hidden subgroup headings in the
 * browser panel, which a bare text match would find first.
 */
function drillTitle(page: import('@playwright/test').Page, title: string) {
  return page.locator('span.font-semibold:visible').filter({ hasText: new RegExp(`^${title}$`) });
}

test.describe('analytics drill-down', () => {
  test('a generation row opens that generation', async ({ page }) => {
    await openAnalytics(page);
    await chartRow(page, 'Gen 1').click();
    // Seeded dex is ids 1..100, i.e. all Gen 1 — the drill-down must name it.
    await expect(drillTitle(page, 'Generation 1')).toBeVisible();
  });

  test('a body-shape row opens that shape', async ({ page }) => {
    await openAnalytics(page);
    await page.getByRole('heading', { name: 'Body Shape' }).scrollIntoViewIfNeeded();
    // "Quadruped" is well represented across ids 1..100.
    await chartRow(page, 'Quadruped').click();
    await expect(drillTitle(page, 'Quadruped Shape')).toBeVisible();
  });

  test('a type row opens that type', async ({ page }) => {
    await openAnalytics(page);
    await chartRow(page, 'Poison').click();
    await expect(drillTitle(page, 'Poison Type')).toBeVisible();
  });
});
