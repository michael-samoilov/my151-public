import { expect, test, type Page } from '@playwright/test';

/**
 * The admin dashboard stays current while it is open, and a failed load keeps
 * what is on screen. `/api/submissions` is mocked, so the preview server needs
 * no token and nothing reaches production.
 */

const T0 = new Date('2026-09-26T06:39:00Z').getTime();
const DAY = 86_400_000;

function curve() {
  return { survival: [{ t: 0, s: 1 }], stats: { p50: 0, p75: 0, p90: 0 }, n: 1 };
}

function dashboard(users: number) {
  const slice = {
    users,
    activity: [
      { day: T0 - 2 * DAY, dau: 3, rolling7: 3 },
      { day: T0 - DAY, dau: 4, rolling7: 5 },
    ],
    retention: { returning: 1, activeLast7: 2, newUsers: 1 },
    timeCurves: { longest: curve(), first: curve(), all: curve() },
    countries: { US: users },
    languages: {},
    locales: {},
    devices: { mobile: users },
    os: {},
    browsers: {},
    hours: new Array(24).fill(0),
    heatmap: Array.from({ length: 7 }, () => new Array(24).fill(0)),
  };
  return {
    totalUsers: users,
    offset: 0,
    limit: 50,
    funnel: { users, completed: 0, exported: 0 },
    retention: slice.retention,
    timeSurvival: [],
    timeStats: { p50: 0, p75: 0, p90: 0 },
    depthSurvival: [],
    depthStats: { p50: 0, p75: 0, p90: 0 },
    countries: slice.countries,
    devices: slice.devices,
    os: {},
    hours: slice.hours,
    heatmap: slice.heatmap,
    popularFinal: [],
    mostDropped: [],
    popularBySection: {},
    droppedBySection: {},
    picksBySectionAll: {},
    byTool: { all: slice, dex: slice, league: slice },
    records: [],
  };
}

/** Answers each dashboard request from `statuses` in turn; the last one repeats. */
async function mockApi(page: Page, statuses: number[]) {
  const dashboardUrls: string[] = [];
  const searchUrls: string[] = [];
  await page.route('**/api/**', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route('**/api/search-performance**', (route) => {
    searchUrls.push(route.request().url());
    return route.fulfill({ status: 500, body: '' });
  });
  await page.route('**/api/submissions**', (route) => {
    dashboardUrls.push(route.request().url());
    const status = statuses[Math.min(dashboardUrls.length, statuses.length) - 1];
    return status === 200
      ? route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(dashboard(10 + dashboardUrls.length)) })
      : route.fulfill({ status, contentType: 'application/json', body: '{"error":"x"}' });
  });
  return { dashboardUrls, searchUrls };
}

async function returnToTab(page: Page) {
  await page.evaluate(() => {
    const set = (state: 'hidden' | 'visible') => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    set('hidden');
    set('visible');
  });
}

const asOf = (page: Page) => page.getByText(/ · as of /);
const tokenForm = (page: Page) => page.getByPlaceholder('Admin token');

test.use({ timezoneId: 'UTC', locale: 'en-US' });

test.describe('admin dashboard freshness', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('p151-admin-token', 'test-token'));
    await page.clock.install({ time: T0 });
  });

  test('a failed refresh keeps the dashboard and shows the error', async ({ page }) => {
    await mockApi(page, [200, 429]);
    await page.goto('/?admin');
    await expect(asOf(page)).toBeVisible();

    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByText('Request failed (429).')).toBeVisible();
    await expect(tokenForm(page)).toHaveCount(0);
    await expect(asOf(page)).toBeVisible();
  });

  test('a rejected token still shows the token form', async ({ page }) => {
    await mockApi(page, [200, 401]);
    await page.goto('/?admin');
    await expect(asOf(page)).toBeVisible();

    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(tokenForm(page)).toBeVisible();
    await expect(page.getByText('Invalid admin token.')).toBeVisible();
  });

  test('the header shows the time of the last load', async ({ page }) => {
    await mockApi(page, [200]);
    await page.goto('/?admin');
    await expect(asOf(page)).toHaveText(/ · as of Sep 26, 6:39 AM$/);
  });

  test('returning to the tab refetches data older than a minute', async ({ page }) => {
    const api = await mockApi(page, [200]);
    await page.goto('/?admin');
    await expect(asOf(page)).toBeVisible();

    await page.clock.fastForward(30_000);
    await returnToTab(page);
    await page.waitForTimeout(500);
    expect(api.dashboardUrls, 'data 30 s old is kept').toHaveLength(1);

    await page.clock.fastForward(31_000);
    await returnToTab(page);
    await expect.poll(() => api.dashboardUrls.length).toBe(2);
    await expect(asOf(page)).toHaveText(/as of Sep 26, 6:40 AM$/);
    expect(api.searchUrls.every((url) => !url.includes('refresh=1')), 'background refresh never forces providers').toBe(true);
  });

  test('a background refresh that answers after Load more keeps the loaded rows', async ({ page }) => {
    const record = (i: number) => ({
      cid: `c${i}`,
      firstTs: T0 - DAY,
      firstAt: new Date(T0 - DAY).toISOString(),
      lastTs: T0 - i * 60_000,
      lastAt: new Date(T0 - i * 60_000).toISOString(),
      submits: 1,
      maxDepth: 1,
      localHour: 12,
      everIds: [],
      latestIds: [],
      completed: false,
      exported: false,
    });
    let calls = 0;
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route('**/api/submissions**', async (route) => {
      calls += 1;
      // The second request is the background refresh. Hold it until Load more has answered.
      if (calls === 2) await held;
      const limit = Number(new URL(route.request().url()).searchParams.get('limit'));
      const body = { ...dashboard(200), limit, totalDexRecords: 200, records: Array.from({ length: limit }, (_, i) => record(i)) };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/?admin');
    await page.getByRole('navigation', { name: 'Admin section' }).getByRole('button', { name: 'Dex', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Load more (50 / 200)' })).toBeVisible();

    await page.clock.fastForward(61_000);
    await returnToTab(page);
    await expect.poll(() => calls).toBe(2);
    await page.getByRole('button', { name: 'Load more (50 / 200)' }).click();
    await expect(page.getByRole('button', { name: 'Load more (100 / 200)' })).toBeVisible();

    release();
    await page.waitForTimeout(500);
    await expect(page.getByRole('button', { name: 'Load more (100 / 200)' })).toBeVisible();
  });

  test('refetches every five minutes while visible', async ({ page }) => {
    const api = await mockApi(page, [200]);
    await page.goto('/?admin');
    await expect(asOf(page)).toBeVisible();

    await page.clock.runFor(5 * 60_000);
    await expect.poll(() => api.dashboardUrls.length).toBe(2);
  });
});
