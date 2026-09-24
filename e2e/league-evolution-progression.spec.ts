import { expect, test } from '@playwright/test';
import { blankLeague } from './support/leagueSeed';

test('a later middle evolution gets its own league row', async ({ page }) => {
  await blankLeague(page);
  await page.goto('/custom-gym-leader');
  await page.click('[data-testid="league-slot-0"]');
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.click('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(500);

  const search = page.locator('input').last();
  await search.fill('rhyhorn');
  const rhyhorn = page.getByRole('button', { name: /^rhyhorn Rhyhorn/ }).first();
  await expect(rhyhorn).toBeVisible();
  await rhyhorn.evaluate((tile) => (tile as HTMLElement).click());
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const member = (row: number) => page
    .locator(`[data-testid="card-cell-${row}-1"] img`)
    .getAttribute('alt');
  await expect.poll(() => member(7)).toBe('rhydon');
  await expect.poll(() => member(8)).toBe('rhyperior');
  await expect.poll(() => member(10)).toBe('rhyperior');
});
