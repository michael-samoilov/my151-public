import { expect, test } from '@playwright/test';

/**
 * Admin Flows Sankey, driven against `/?admin&demo` so it needs no token.
 *
 * Locks the three promises of this slice: unknown referrers stay on the
 * referrer chart, the dex incomplete peel is five size tiers, and the gym
 * leader maker has its own usage funnel.
 */
test.describe('admin flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?admin&demo');
    await expect(page.getByRole('heading', { name: /Analytics/ })).toBeVisible();
  });

  test('dex usage funnel peels incomplete builds by size', async ({ page }) => {
    const funnel = page.getByRole('img', { name: /Dex usage funnel/ });
    await expect(funnel).toBeVisible();
    const label = await funnel.getAttribute('aria-label');
    expect(label).toContain('1–30');
    expect(label).toContain('31–60');
    expect(label).toContain('61–90');
    expect(label).toContain('91–120');
    expect(label).toContain('121–150');
  });

  test('referrer flow keeps an unknown-referrer source', async ({ page }) => {
    await page.getByRole('button', { name: 'Referrer → landing' }).click();
    const chart = page.getByRole('img', { name: /Referrer to landing/ });
    await expect(chart).toBeVisible();
    await expect(chart).toHaveAttribute('aria-label', /referrer not known/);
  });

  test('league tab shows a gym-leader usage funnel', async ({ page }) => {
    await page.getByRole('button', { name: 'League', exact: true }).click();
    const funnel = page.getByRole('img', { name: /League usage funnel/ });
    await expect(funnel).toBeVisible();
    const label = await funnel.getAttribute('aria-label');
    expect(label).toMatch(/opened/i);
    expect(label).toMatch(/seated/i);
    expect(label).toMatch(/1–3 cards|4–7 cards|8–11 cards/);
    expect(label).toMatch(/full league/i);
  });
});
