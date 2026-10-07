import { expect, test, type Locator } from '@playwright/test';

/**
 * Admin Flows Sankey, driven against `/?admin&demo` so it needs no token.
 *
 * Locks the three promises of this slice: unknown referrers stay on the
 * referrer chart, the dex incomplete peel is five size tiers in one column,
 * and the gym leader maker has its own usage funnel. The chart is an
 * echarts Sankey at every width; on phone and narrow viewports it must not
 * need a sideways pan.
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

  test('picker flows include every progress stage and exclusive export outcomes', async ({ page }, info) => {
    await page.getByRole('button', { name: 'Picker', exact: true }).click();
    const funnel = page.getByRole('img', { name: /Favorite Pokémon usage funnel/ });
    await expect(funnel).toBeVisible();
    await expect(funnel.locator('canvas')).toBeVisible();
    const label = await funnel.getAttribute('aria-label');
    for (const stage of ['Not started', '1–64 cells', '65–128 cells', '129–192 cells', '193–256 cells', 'Completed']) {
      expect(label).toContain(stage);
    }
    expect(label).toMatch(/full grid only.*simplified only.*both views.*not exported/);
    await info.attach('picker-flow-stages', { body: JSON.stringify({ label }), contentType: 'application/json' });
  });

  test('picker flow fits every viewport without sideways pan', { tag: '@viewport' }, async ({ page }, info) => {
    await page.getByRole('button', { name: 'Picker', exact: true }).click();
    const funnel = page.getByRole('img', { name: /Favorite Pokémon usage funnel/ });
    await expect(funnel.locator('canvas')).toBeVisible();
    await expectNoSidewaysPan(funnel);
    if (info.project.name !== 'desktop') await expectFitsPhoneHeight(funnel);
    await info.attach('picker-flow-viewport', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });

  test('referrer flow keeps an unknown-referrer source', async ({ page }) => {
    await page.getByRole('button', { name: 'Referrer → landing' }).click();
    const chart = page.getByRole('img', { name: /Referrer to landing/ });
    await expect(chart).toBeVisible();
    await expect(chart).toHaveAttribute('aria-label', /referrer not known/);
    await expect(chart).toHaveAttribute('aria-label', /favorites/);
  });

  test('league tab shows a gym-leader usage funnel', async ({ page }) => {
    await page.getByRole('button', { name: 'League', exact: true }).click();
    const funnel = page.getByRole('img', { name: /League usage funnel/ });
    await expect(funnel).toBeVisible();
    const label = await funnel.getAttribute('aria-label');
    expect(label).toMatch(/opened/i);
    expect(label).toMatch(/placed a pokémon/i);
    expect(label).toMatch(/1–4 gyms|5–8 gyms|9–12 gyms/);
    expect(label).toMatch(/full league/i);
    expect(label).toMatch(/kept private/i);
  });

  test('phone dex funnel is a Sankey that stays in the column', { tag: '@viewport' }, async ({ page }, info) => {
    test.skip(info.project.name === 'desktop', 'desktop width is not the pan risk');
    const funnel = page.getByRole('img', { name: /Dex usage funnel/ });
    await expect(funnel).toBeVisible();
    await expect(funnel.locator('canvas')).toBeVisible();
    await expectNoSidewaysPan(funnel);
    await expectFitsPhoneHeight(funnel);
  });

  test('phone league funnel is a Sankey that stays in the column', { tag: '@viewport' }, async ({ page }, info) => {
    test.skip(info.project.name === 'desktop', 'desktop width is not the pan risk');
    await page.getByRole('button', { name: 'League', exact: true }).click();
    const funnel = page.getByRole('img', { name: /League usage funnel/ });
    await expect(funnel).toBeVisible();
    await expect(funnel.locator('canvas')).toBeVisible();
    await expectNoSidewaysPan(funnel);
    await expectFitsPhoneHeight(funnel);
  });

  test('phone referrer Sankey stays in the column', { tag: '@viewport' }, async ({ page }, info) => {
    test.skip(info.project.name === 'desktop', 'desktop width is not the pan risk');
    await page.getByRole('button', { name: 'Referrer → landing' }).click();
    const chart = page.getByRole('img', { name: /Referrer to landing/ });
    await expect(chart).toBeVisible();
    await expect(chart.locator('canvas')).toBeVisible();
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

async function expectFitsPhoneHeight(chart: Locator) {
  const h = await chart.evaluate((el) => el.getBoundingClientRect().height);
  expect(h, 'funnel taller than a phone can show with Who').toBeLessThan(360);
}
