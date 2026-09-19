import { expect, test } from '@playwright/test';

function activeUsers(page: import('@playwright/test').Page) {
  return page.locator('section', { has: page.getByRole('heading', { name: 'Active users' }) });
}

function daysInLabel(label: string | null): number {
  const m = label?.match(/over (\d+) days/);
  return m ? Number(m[1]) : NaN;
}

function gutter(label: string | null): { hours24: string | undefined; days7: string | undefined } {
  return {
    hours24: label?.match(/Last 24 hours (\d+)/)?.[1],
    days7: label?.match(/last 7 days (\d+)/)?.[1],
  };
}

test.describe('admin active users range', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?admin&demo');
    await expect(page.getByRole('heading', { name: /Analytics/ })).toBeVisible();
  });

  test('range chips default to All and keep last-point gutter counts', async ({ page }) => {
    const panel = activeUsers(page);
    const range = panel.getByRole('group', { name: 'Chart range' });
    await expect(range.getByRole('button', { name: '24h' })).toBeVisible();
    await expect(range.getByRole('button', { name: '7d' })).toBeVisible();
    await expect(range.getByRole('button', { name: '30d' })).toBeVisible();
    await expect(range.getByRole('button', { name: '90d' })).toBeVisible();
    await expect(range.getByRole('button', { name: '180d' })).toBeVisible();
    await expect(range.getByRole('button', { name: '365d' })).toBeVisible();
    await expect(range.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');

    const chart = panel.getByRole('img', { name: /Daily active users/ });
    const allLabel = await chart.getAttribute('aria-label');
    const allDays = daysInLabel(allLabel);
    const allGutter = gutter(allLabel);
    expect(allDays).toBeGreaterThan(32);

    await range.getByRole('button', { name: '30d' }).click();
    await expect(range.getByRole('button', { name: '30d' })).toHaveAttribute('aria-pressed', 'true');
    const slicedLabel = await chart.getAttribute('aria-label');
    const slicedDays = daysInLabel(slicedLabel);
    expect(slicedDays).toBeGreaterThanOrEqual(30);
    expect(slicedDays).toBeLessThanOrEqual(32);
    expect(slicedDays).toBeLessThan(allDays);
    expect(gutter(slicedLabel)).toEqual(allGutter);
  });

  test('24h plots hourly unique users and hides the weekly series', async ({ page }) => {
    const panel = activeUsers(page);
    await panel.getByRole('group', { name: 'Chart range' }).getByRole('button', { name: '24h' }).click();
    const chart = panel.getByRole('img', { name: /Hourly active users/ });
    await expect(chart).toBeVisible();
    const label = await chart.getAttribute('aria-label');
    expect(label).toMatch(/over 2[34] hours/);
    expect(label).not.toMatch(/weekly/i);
    await expect(panel.getByText('weekly', { exact: true })).toHaveCount(0);
    const hours = Number(label?.match(/over (\d+) hours/)?.[1]);
    expect(hours).toBeGreaterThanOrEqual(23);
    expect(hours).toBeLessThanOrEqual(24);
  });

  test('7d splits hourly unique users by weekday and hides the weekly series', async ({ page }) => {
    const panel = activeUsers(page);
    await panel.getByRole('group', { name: 'Chart range' }).getByRole('button', { name: '7d' }).click();
    const chart = panel.getByRole('img', { name: /Hourly active users by weekday/ });
    await expect(chart).toBeVisible();
    const label = await chart.getAttribute('aria-label');
    expect(label).not.toMatch(/weekly/i);
    for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
      await expect(panel.getByText(day, { exact: true })).toBeVisible();
    }
    await expect(panel.getByText('weekly', { exact: true })).toHaveCount(0);
  });
});
