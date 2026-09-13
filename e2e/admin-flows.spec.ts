import { expect, test, type Locator } from '@playwright/test';

/**
 * Admin Flows Sankey, driven against `/?admin&demo` so it needs no token.
 *
 * Locks the three promises of this slice: unknown referrers stay on the
 * referrer chart, the dex incomplete peel is five size tiers, and the gym
 * leader maker has its own usage funnel. On phone and narrow viewports the
 * funnels are labeled HTML bars, so peels stay readable without a sideways pan.
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

  test('phone dex funnel shows peel labels without a sideways pan', async ({ page }, info) => {
    test.skip(info.project.name === 'desktop', 'desktop keeps the Sankey');
    const funnel = page.getByRole('img', { name: /Dex usage funnel/ });
    await expect(funnel).toBeVisible();
    await expect(funnel.getByText('1–30', { exact: true })).toBeVisible();
    await expect(funnel.getByText('31–60', { exact: true })).toBeVisible();
    await expect(funnel.getByText('121–150', { exact: true })).toBeVisible();
    await expectNoSidewaysPan(funnel);
  });

  test('phone league funnel shows card peels without a sideways pan', async ({ page }, info) => {
    test.skip(info.project.name === 'desktop', 'desktop keeps the Sankey');
    await page.getByRole('button', { name: 'League', exact: true }).click();
    const funnel = page.getByRole('img', { name: /League usage funnel/ });
    await expect(funnel).toBeVisible();
    await expect(funnel.getByText('1–3 cards', { exact: true })).toBeVisible();
    await expect(funnel.getByText('Full league', { exact: true })).toBeVisible();
    await expectNoSidewaysPan(funnel);
  });

  test('phone referrer list wraps host names without a sideways pan', async ({ page }, info) => {
    test.skip(info.project.name === 'desktop', 'desktop keeps the Sankey');
    await page.getByRole('button', { name: 'Referrer → landing' }).click();
    const chart = page.getByRole('img', { name: /Referrer to landing/ });
    await expect(chart).toBeVisible();
    await expect(chart.getByText('referrer not known', { exact: true })).toBeVisible();
    await expectNoSidewaysPan(chart);
  });
});

async function expectNoSidewaysPan(chart: Locator) {
  await chart.scrollIntoViewIfNeeded();
  const metrics = await chart.evaluate((el) => {
    const nodes = [el, ...el.querySelectorAll('*')];
    const rights = nodes.map((n) => n.getBoundingClientRect().right);
    const r = el.getBoundingClientRect();
    return {
      elOverflow: el.scrollWidth - el.clientWidth,
      widerThanViewport: r.width - window.innerWidth,
      pastRight: Math.max(...rights) - window.innerWidth,
    };
  });
  expect(metrics.elOverflow, 'chart scrolls sideways').toBeLessThanOrEqual(1);
  expect(metrics.widerThanViewport, 'chart wider than viewport').toBeLessThanOrEqual(2);
  expect(metrics.pastRight, 'chart extends past the right edge').toBeLessThanOrEqual(2);
}
