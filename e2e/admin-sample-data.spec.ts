import { openAdmin } from './admin-ready';
import { expect, test, type Page } from './support/test';
import { buildDashboard, type DashboardSource } from '../api/_dashboard';

const DAY = 86_400_000;

function source(now: number): DashboardSource {
  const ts = now - DAY;
  const row = {
    cid: 'e2e-live-a',
    firstTs: ts,
    firstAt: new Date(ts).toISOString(),
    lastTs: ts,
    lastAt: new Date(ts).toISOString(),
    submits: 1,
    sessions: 1,
    sessionMs: [60_000],
    sessionLog: [{ ts, ids: [1, 4, 7] }],
    maxDepth: 3,
    localHour: 12,
    tz: 'UTC',
    country: 'US',
    device: 'Mobile',
    os: 'iOS',
    browser: 'Safari',
    everIds: [1, 4, 7],
    latestIds: [1, 4, 7],
    completed: false,
    exported: false,
  };
  return {
    clients: { [row.cid]: JSON.stringify(row) },
    archived: [],
    funnel: { 'intro-shown': '1' },
    funnelWindow: null,
    leagueClients: {},
  };
}

async function stubLiveDashboard(page: Page): Promise<void> {
  await page.route('**/api/submissions?**', (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('usage') === '1') return route.fulfill({ json: { status: 'not_configured' } });
    const now = Date.now();
    return route.fulfill({ json: buildDashboard(source(now), { range: 'all' }, now) });
  });
  await page.route('**/api/search-performance**', (route) => route.fulfill({ status: 503, json: { error: 'off' } }));
  await page.addInitScript(() => localStorage.setItem('p151-admin-token', 'e2e'));
}

const sampleLabel = (page: Page) => page.getByRole('banner').getByText('Sample data', { exact: true });

test.describe('admin sample data label', { tag: '@viewport' }, () => {
  test('the demo marks its fixtures as sample data and keeps the label on screen', async ({ page }, testInfo) => {
    await openAdmin(page, '/?admin&demo');
    const label = sampleLabel(page);
    await expect(label).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(label).toBeInViewport();
    const header = await page.getByRole('banner').evaluate((el) => ({
      overflow: el.scrollWidth - el.clientWidth,
      label: el.querySelector('span.rounded-full')?.getBoundingClientRect().toJSON(),
    }));
    expect(header.overflow).toBeLessThanOrEqual(0);
    await testInfo.attach('sample-data-label.json', { body: JSON.stringify(header), contentType: 'application/json' });
  });

  test('live data shows no sample data label', async ({ page }) => {
    await stubLiveDashboard(page);
    await openAdmin(page, '/?admin');
    await expect(page.getByRole('heading', { level: 1, name: /Analytics/ })).toBeVisible();
    await expect(sampleLabel(page)).toHaveCount(0);
  });
});
