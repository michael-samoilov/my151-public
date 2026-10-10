import { expect, test } from '@playwright/test';
import {buildDashboard} from '../api/_dashboard';

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

  test('the date range defaults to All and keeps last-point gutter counts', async ({ page }) => {
    const panel = activeUsers(page);
    const range = page.getByRole('group', { name: 'Date range' });
    await expect(range.getByRole('button', { name: '24h' })).toBeVisible();
    await expect(range.getByRole('button', { name: '7d' })).toBeVisible();
    await expect(range.getByRole('button', { name: '28d' })).toBeVisible();
    await expect(range.getByRole('button', { name: '90d' })).toBeVisible();
    await expect(range.getByRole('button', { name: '180d' })).toBeVisible();
    await expect(range.getByRole('button', { name: '365d' })).toBeVisible();
    await expect(range.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');

    const chart = panel.getByRole('img', { name: /Daily active users/ });
    const allLabel = await chart.getAttribute('aria-label');
    const allDays = daysInLabel(allLabel);
    const allGutter = gutter(allLabel);
    expect(allDays).toBeGreaterThan(32);

    await range.getByRole('button', { name: '28d' }).click();
    await expect(range.getByRole('button', { name: '28d' })).toHaveAttribute('aria-pressed', 'true');
    const slicedLabel = await chart.getAttribute('aria-label');
    const slicedDays = daysInLabel(slicedLabel);
    expect(slicedDays).toBeGreaterThanOrEqual(28);
    expect(slicedDays).toBeLessThanOrEqual(30);
    expect(slicedDays).toBeLessThan(allDays);
    expect(gutter(slicedLabel)).toEqual(allGutter);
  });

  test('24h plots hourly unique users and hides the weekly series', async ({ page }) => {
    const panel = activeUsers(page);
    await page.getByRole('group', { name: 'Date range' }).getByRole('button', { name: '24h' }).click();
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

  test('monthly legend toggles and implied growth follows the selected recorded range @viewport', async ({ page }, testInfo) => {
    const now = Date.now(), day = 86_400_000;
    const today = Math.floor(now / day) * day;
    const clients = Object.fromEntries(Array.from({length:32}, (_,i) => {
      const cid = `activity-e2e-${i}`;
      const activeDays = Array.from({length:90}, (_,d) => today - (89-d)*day)
        .filter((_,d) => i < 8 + Math.floor(d/4));
      return [cid, JSON.stringify({cid, firstTs:today-89*day, lastTs:now, submits:2, sessions:1,
        sessionMs:[60_000,60_000], sessionLog:[{ts:activeDays[0] ?? now,ids:[1]},{ts:now,ids:[1]}], activeDays, activityCoverageFrom:today-89*day,
        maxDepth:1, everIds:[1], latestIds:[1], completed:false, exported:false})];
    }));
    const payload = buildDashboard({clients,archived:[],funnel:{},funnelWindow:null,leagueClients:{}},{range:'all'},now);
    await page.route('**/api/submissions?**', route => route.fulfill({json:payload}));
    await page.evaluate(() => localStorage.setItem('p151-admin-token','e2e'));
    await page.goto('/?admin');
    const panel = activeUsers(page);
    const monthly = panel.getByRole('button', { name: 'monthly', exact: true });
    await expect(monthly).toHaveAttribute('aria-pressed', 'true');
    const growth = panel.getByLabel('Implied growth over selected range');
    await expect(growth).toHaveText(/Implied WoW [+-]?[\d,.]+% · MoM [+-]?[\d,.]+%/);
    await expect(panel.getByText(/complete retained history/)).toHaveCount(0);
    const chart = panel.getByRole('img');
    await expect(chart).toHaveAttribute('aria-label', /7d label implied growth .*% WoW.*30d label implied growth .*% MoM/);
    const allGrowth = await growth.textContent();
    await page.getByRole('group', {name: 'Date range'}).getByRole('button', {name: '28d', exact: true}).click();
    await expect(growth).not.toHaveText(allGrowth!);
    await expect(panel.getByText(/27 complete recorded days/)).toBeVisible();
    const selectedGrowth = await growth.textContent();
    const weeklyRate = selectedGrowth!.match(/WoW ([^ ]+)/)![1];
    const monthlyRate = selectedGrowth!.match(/MoM ([^ ]+)/)![1];
    await expect(chart).toHaveAttribute('aria-label', new RegExp(`7d label implied growth ${weeklyRate.replace(/[+.%]/g, '\\$&')} WoW`));
    await expect(chart).toHaveAttribute('aria-label', new RegExp(`30d label implied growth ${monthlyRate.replace(/[+.%]/g, '\\$&')} MoM`));
    await page.getByRole('group', {name: 'Date range'}).getByRole('button', {name: 'All', exact: true}).click();
    await expect(growth).toHaveText(allGrowth!);
    await monthly.click();
    await expect(monthly).toHaveAttribute('aria-pressed', 'false');
    await expect(panel.getByRole('img')).not.toHaveAttribute('aria-label', /trailing 30-day|30d label implied growth/);
    await monthly.click();
    await expect(panel.getByRole('img')).toHaveAttribute('aria-label', /trailing 30-day/);
    await testInfo.attach('monthly-toggle-and-coverage', { body: await panel.screenshot(), contentType: 'image/png' });
    for (const name of ['daily', 'weekly', 'monthly']) {
      await panel.getByRole('button', { name, exact: true }).click();
    }
    await expect(panel.getByRole('img')).toBeVisible();
    await expect(panel.getByRole('img')).not.toHaveAttribute('aria-label', /trailing|label implied growth/);
    await testInfo.attach('all-series-hidden', { body: await panel.screenshot(), contentType: 'image/png' });
  });

  test('7d plots one daily series with weekday axis labels and hides the weekly series', async ({ page }) => {
    const panel = activeUsers(page);
    await page.getByRole('group', { name: 'Date range' }).getByRole('button', { name: '7d' }).click();
    const chart = panel.getByRole('img', { name: /Daily active users/ });
    await expect(chart).toBeVisible();
    const label = await chart.getAttribute('aria-label');
    const days = Number(label?.match(/over (\d+) days/)?.[1]);
    expect(days).toBeGreaterThanOrEqual(6);
    expect(days).toBeLessThanOrEqual(8);
    expect(label).not.toMatch(/over \d+ hours/);
    expect(label).not.toMatch(/weekly/i);
    expect(label).not.toMatch(/month|year/i);
    const weekdays = [...(label?.matchAll(/\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/g) ?? [])].map((m) => m[1]);
    expect(weekdays).toHaveLength(7);
    expect(new Set(weekdays).size).toBe(7);
    await expect(panel.getByText('weekly', { exact: true })).toHaveCount(0);
    await expect(panel.getByText('hourly', { exact: true })).toHaveCount(0);
    await expect(panel.getByRole('img')).toHaveCount(1);
  });
});
