import { expect, test } from '@playwright/test';
import { seededLeague } from './support/leagueSeed';

/**
 * The red active pill is one control on two pages: the dex builder's view
 * nav and the league home's Story / Rematch toggle. Both take the shared
 * button's small size, so both are the same height in every viewport. The
 * league's used to trim its box to fit beside the two-line title, and the
 * two pills read as two designs.
 */
test('the dex nav pill and the league toggle pill are the same height', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[data-nav="builder"]');
  await page.waitForTimeout(300);
  const dex = await page.locator('[data-nav="builder"]').evaluate((el) => el.getBoundingClientRect().height);

  await seededLeague(page);
  await page.goto('/pokemon-league-builder');
  await page.waitForSelector('[data-league-view][aria-pressed="true"]');
  await page.waitForTimeout(300);
  const league = await page.locator('[data-league-view][aria-pressed="true"]').first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const bar = el.closest('[data-testid="league-tool-bar"]')!.getBoundingClientRect();
    return { height: r.height, inside: r.top >= bar.top - 0.5 && r.bottom <= bar.bottom + 0.5 };
  });
  expect(Math.abs(league.height - dex), `dex pill ${dex}px, league pill ${league.height}px`).toBeLessThanOrEqual(0.5);
  expect(league.inside, 'the pill sits inside the league tool bar').toBe(true);
});
