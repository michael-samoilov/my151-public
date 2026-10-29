import { openAdmin } from './admin-ready';
import { expect, test } from '@playwright/test';
import {buildDashboard} from '../api/_dashboard';

function activityPayload(now = Date.now()) {
    const day = 86_400_000;
    const today = Math.floor(now / day) * day;
    const clients = Object.fromEntries(Array.from({length:32}, (_,i) => {
      const cid = `activity-e2e-${i}`;
      const activeDays = Array.from({length:90}, (_,d) => today - (89-d)*day)
        .filter((_,d) => i < 8 + Math.floor(d/4));
      return [cid, JSON.stringify({cid, firstTs:today-89*day, lastTs:now, submits:2, sessions:1,
        sessionMs:[60_000,60_000], sessionLog:[{ts:activeDays[0] ?? now,ids:[1]},{ts:now,ids:[1]}], activeDays, activityCoverageFrom:today-89*day,
        maxDepth:1, everIds:[1], latestIds:[1], completed:false, exported:false})];
    }));
    return buildDashboard({clients,archived:[],funnel:{},funnelWindow:null,leagueClients:{}},{range:'all'},now);
}

function activeUsers(page: import('@playwright/test').Page) {
  return page.locator('section', { has: page.getByRole('heading', { name: 'Active users' }) });
}

function daysInLabel(label: string | null): number {
  const m = label?.match(/over (\d+) days/);
  return m ? Number(m[1]) : NaN;
}

const TODAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getUTCDay()];

function gutter(label: string | null): { today: string | undefined; hours24: string | undefined; days7: string | undefined } {
  return {
    today: label?.match(new RegExp(`${TODAY} so far (\\d+)`))?.[1],
    hours24: label?.match(/Last 24 hours (\d+)/)?.[1],
    days7: label?.match(/last 7 days (\d+)/)?.[1],
  };
}

test.describe('admin active users range', () => {
  test.beforeEach(async ({ page }) => {
    await openAdmin(page, '/?admin&demo');
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
    await page.addInitScript(() => {
      const original = CanvasRenderingContext2D.prototype.fillText;
      const state = window as unknown as { hourlyPaints: string[] };
      state.hourlyPaints = [];
      CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
        if (this.canvas.closest('[role="img"]')?.getAttribute('aria-label')?.startsWith('Hourly active users')) state.hourlyPaints.push(text);
        return maxWidth === undefined ? original.call(this, text, x, y) : original.call(this, text, x, y, maxWidth);
      };
    });
    await openAdmin(page, '/?admin&demo');
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
    // The newest point counts the past 60 minutes, and its label says so.
    const pastHour = label?.match(/Past hour (\d+)\./)?.[1];
    expect(pastHour).toBeDefined();
    const paints = () => page.evaluate(() => (window as unknown as { hourlyPaints: string[] }).hourlyPaints);
    await expect.poll(paints).toContain('1h');
    expect(await paints()).not.toContain('24h');
    const box = await chart.boundingBox();
    await page.mouse.move(box!.x + box!.width - 1, box!.y + box!.height / 2);
    await expect(chart.locator('[data-scrub-readout]')).toContainText(`Past hour`);
    await expect(chart.locator('[data-scrub-readout]')).toContainText(`${pastHour} hourly`);
  });

  test('monthly legend toggles and implied growth follows the selected recorded range @viewport', async ({ page }, testInfo) => {
    const payload = activityPayload();
    await page.route('**/api/submissions?**', route => route.fulfill({json:payload}));
    await page.evaluate(() => localStorage.setItem('p151-admin-token','e2e'));
    await openAdmin(page, '/?admin');
    const panel = activeUsers(page);
    await panel.waitFor({ state: 'visible' });
    const monthly = panel.getByRole('button', { name: 'monthly', exact: true });
    await expect(panel.getByRole('button', { name: 'daily', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(panel.getByRole('button', { name: 'weekly', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(monthly).toHaveAttribute('aria-pressed', 'false');
    await expect(panel.getByRole('img')).not.toHaveAttribute('aria-label', /trailing 30-day|30d label implied growth/);
    await monthly.click();
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

  test('window labels stay on canvas after every toggle order @viewport', async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      const original = CanvasRenderingContext2D.prototype.fillText;
      const state = window as unknown as { paintedLabels: string[] };
      state.paintedLabels = [];
      CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
        if (this.canvas.closest('[role="img"]')?.getAttribute('aria-label')?.startsWith('Daily active users')) {
          const point = this.getTransform().transformPoint({x, y});
          if (point.x >= 0 && point.x < this.canvas.width && point.y >= 0 && point.y < this.canvas.height) {
            state.paintedLabels.push(text);
          }
        }
        return maxWidth === undefined ? original.call(this, text, x, y) : original.call(this, text, x, y, maxWidth);
      };
    });
    await page.route('**/api/submissions?**', route => route.fulfill({json:activityPayload()}));
    await page.evaluate(() => localStorage.setItem('p151-admin-token','e2e'));
    await openAdmin(page, '/?admin');
    const panel = activeUsers(page);
    const growth = await panel.getByLabel('Implied growth over selected range').textContent();
    const expected = {
      daily: ['24h'],
      weekly: ['7d', `${growth!.match(/WoW ([^ ]+)/)![1]} WoW`],
      monthly: ['30d', `${growth!.match(/MoM ([^ ]+)/)![1]} MoM`],
    };
    const names = ['daily', 'weekly', 'monthly'] as const;
    const shown = new Set<string>(['daily', 'weekly']);
    const orders = [names, ['monthly','weekly','daily'], ['weekly','daily','monthly'],
      ['daily','monthly','weekly'], ['monthly','daily','weekly'], ['weekly','monthly','daily']];
    for (const order of orders) {
      for (const name of [...order, ...order]) {
        await page.evaluate(() => (window as unknown as {paintedLabels:string[]}).paintedLabels = []);
        await panel.getByRole('button', {name, exact:true}).click();
        if (shown.has(name)) shown.delete(name); else shown.add(name);
        await expect.poll(() => page.evaluate(() => (window as unknown as {paintedLabels:string[]}).paintedLabels.length)).toBeGreaterThan(0);
        for (const kind of names) {
          for (const label of expected[kind]) {
            const paints = () => page.evaluate(() => (window as unknown as {paintedLabels:string[]}).paintedLabels);
            if (shown.has(kind)) await expect.poll(paints).toContain(label);
            else expect(await paints()).not.toContain(label);
          }
        }
      }
    }
    await testInfo.attach('restored-window-labels', {body:await panel.screenshot(), contentType:'image/png'});
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
    const axisList = label?.slice(label.lastIndexOf('. ') + 2);
    const weekdays = [...(axisList?.matchAll(/\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/g) ?? [])].map((m) => m[1]);
    expect(weekdays).toHaveLength(7);
    expect(new Set(weekdays).size).toBe(7);
    await expect(panel.getByText('weekly', { exact: true })).toHaveCount(0);
    await expect(panel.getByText('hourly', { exact: true })).toHaveCount(0);
    await expect(panel.getByRole('img')).toHaveCount(1);
  });

  test('a month name that would run into the next is left out, and the year moves on', { tag: '@viewport' }, async ({ page }) => {
    // On October 28 the 90 days of activity start on July 31, one day before August.
    const now = Date.UTC(2026, 9, 28, 12);
    await page.clock.setFixedTime(now);
    await page.addInitScript(() => {
      const original = CanvasRenderingContext2D.prototype.fillText;
      const state = window as unknown as { axisPaints: { text: string; x: number; width: number }[] };
      state.axisPaints = [];
      CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
        if (/^([A-Z][a-z]{2}|\d{4})$/.test(text) && this.canvas.closest('[role="img"]')?.getAttribute('aria-label')?.startsWith('Daily active users')) {
          const at = this.getTransform().transformPoint({ x, y });
          state.axisPaints.push({ text, x: at.x, width: this.measureText(text).width * this.getTransform().a });
        }
        return maxWidth === undefined ? original.call(this, text, x, y) : original.call(this, text, x, y, maxWidth);
      };
    });
    await page.route('**/api/submissions?**', route => route.fulfill({ json: activityPayload(now) }));
    await page.evaluate(() => localStorage.setItem('p151-admin-token', 'e2e'));
    await openAdmin(page, '/?admin');
    await page.evaluate(() => { (window as unknown as { axisPaints: unknown[] }).axisPaints = []; });
    await page.getByRole('group', { name: 'Date range' }).getByRole('button', { name: '90d', exact: true }).click();
    await expect(activeUsers(page).getByRole('img', { name: /over 9[01] days/ })).toBeVisible();
    const paints = () => page.evaluate(() => (window as unknown as { axisPaints: { text: string; x: number; width: number }[] }).axisPaints);
    await expect.poll(async () => (await paints()).map((p) => p.text)).toContain('Oct');
    const last = new Map((await paints()).map((p) => [p.text, p]));
    expect([...last.keys()].sort()).toEqual(['2026', 'Aug', 'Oct', 'Sep']);
    expect(last.get('2026')!.x).toBeCloseTo(last.get('Aug')!.x, 0);
    const months = ['Aug', 'Sep', 'Oct'].map((m) => last.get(m)!);
    for (let i = 1; i < months.length; i++) expect(months[i - 1].x + months[i - 1].width).toBeLessThan(months[i].x);
  });

  test('ranges from 28d end the daily line on the last 24 hours, labeled 24h', async ({ page }) => {
    const payload = activityPayload();
    payload.lastPointLabels = { ...payload.lastPointLabels!, label24h: 97 };
    await page.route('**/api/submissions?**', route => route.fulfill({ json: payload }));
    await page.evaluate(() => localStorage.setItem('p151-admin-token', 'e2e'));
    await openAdmin(page, '/?admin');
    const chart = activeUsers(page).getByRole('img', { name: /Daily active users/ });
    for (const range of ['All', '28d']) {
      await page.getByRole('group', { name: 'Date range' }).getByRole('button', { name: range, exact: true }).click();
      await expect(chart).toHaveAttribute('aria-label', /Last 24 hours 97,/);
      const box = await chart.boundingBox();
      await page.mouse.move(box!.x + box!.width - 1, box!.y + box!.height / 2);
      await expect(chart.locator('[data-scrub-readout]')).toContainText('97 daily');
      await page.mouse.move(0, 0);
    }
  });

  test('7d ends its line on today\'s calendar-day count and labels it with the day name', async ({ page }) => {
    const payload = activityPayload();
    // A last-24-hours count unlike any day's, so a label that used it would show.
    payload.lastPointLabels = { ...payload.lastPointLabels!, label24h: 97 };
    await page.route('**/api/submissions?**', route => route.fulfill({ json: payload }));
    await page.evaluate(() => localStorage.setItem('p151-admin-token', 'e2e'));
    await openAdmin(page, '/?admin');
    await page.getByRole('group', { name: 'Date range' }).getByRole('button', { name: '7d' }).click();
    const chart = activeUsers(page).getByRole('img', { name: /Daily active users/ });
    const today = gutter(await chart.getAttribute('aria-label')).today;
    expect(today).toBeDefined();
    expect(today).not.toBe('97');
    const box = await chart.boundingBox();
    await page.mouse.move(box!.x + box!.width - 1, box!.y + box!.height / 2);
    await expect(chart.locator('[data-scrub-readout]')).toContainText(`${TODAY} · ${today} daily`);
  });
});
