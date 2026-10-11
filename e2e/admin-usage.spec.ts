import { expect, test, type Page } from '@playwright/test';
import { buildDashboard, type DashboardSource } from '../api/_dashboard';

/**
 * The Suite tab's Database card shows Upstash's own numbers, read through
 * `/api/submissions?usage=1`. The stub returns the fields Upstash's
 * "Get Database Stats" sends.
 */

const SOURCE: DashboardSource = {
  clients: {}, archived: [], funnel: {}, funnelWindow: null, leagueClients: {},
};

const point = (x: string, y: number) => ({ x, y });
const STATS = {
  total_monthly_requests: 319_300,
  total_monthly_billing: 0.639,
  total_monthly_bandwidth: 1_786_203_399,
  current_storage: 5_012_345,
  days: ['Thursday', 'Friday'],
  dailyrequests: [point('2026-10-08 00:00:00 +0000 UTC', 65_699), point('2026-10-09 00:00:00 +0000 UTC', 0)],
  bandwidths: [point('2026-10-08 00:00:00 +0000 UTC', 570_000_000), point('2026-10-09 00:00:00 +0000 UTC', 0)],
  dailybilling: [point('2026-10-08 00:00:00 +0000 UTC', 0.131), point('2026-10-09 00:00:00 +0000 UTC', 0)],
  command_counts: [
    { metric_identifier: 'HGET', data_points: [point('a', 100), point('b', 2_400)] },
    { metric_identifier: 'GET', data_points: [point('a', 50), point('b', 3_100)] },
    { metric_identifier: 'DEL', data_points: [point('a', 0), point('b', 0)] },
  ],
};

async function stub(page: Page, usage: unknown) {
  const searchReads: string[] = [];
  await page.route('**/api/submissions?**', (route) => {
    const qs = new URL(route.request().url()).searchParams;
    if (qs.get('usage') === '1') return route.fulfill({ json: usage });
    return route.fulfill({ json: buildDashboard(SOURCE, { range: 'all' }, Date.now()) });
  });
  await page.route('**/api/feedback-list**', (route) => route.fulfill({ json: { items: [], total: 0, offset: 0, limit: 200 } }));
  await page.route('**/api/search-performance**', (route) => {
    searchReads.push(route.request().url());
    return route.fulfill({ status: 503, json: { error: 'off' } });
  });
  await page.addInitScript(() => {
    localStorage.setItem('p151-admin-token', 'e2e');
    localStorage.setItem('p151-admin-range', 'all');
  });
  await page.goto('/?admin');
  await page.getByRole('navigation', { name: 'Admin section' }).getByRole('button', { name: 'Suite', exact: true }).click();
  return searchReads;
}

test.describe('admin database usage', () => {
  for (const status of ['collecting', 'paused', 'disabled'] as const) {
    test(`minute history shows its ${status} allowance separately from the actual bill`, {tag: '@viewport'}, async ({page}, testInfo) => {
      await stub(page, {status: 'ready', stats: STATS, activity: {
        status, usedUnits: 40000, limitUnits: 2000000, bytes: 1048576, limitBytes: 16777216,
        acceptedBuckets: 3500, ...(status === 'collecting' ? {} : {pausedUntil: Date.UTC(2026, 10, 1)}),
      }});
      const card = page.getByTestId('activity-budget');
      await expect(card).toContainText(`Minute history · ${status}`);
      await expect(card).toContainText('3,500 recorded minute fragments');
      await expect(card).toContainText('40,000 / 2,000,000 operation units');
      await expect(card).toContainText('1.0 / 16 MB');
      if (status === 'paused') await expect(card).toContainText('2026-11-01 UTC');
      if (status === 'disabled') await expect(card).toContainText('Collection resumes when enabled.');
      await testInfo.attach('minute-history-status', {body: await card.screenshot(), contentType: 'image/png'});
    });
  }
  test('the Suite tab shows the month, the days, and today by command', async ({ page }) => {
    await stub(page, { status: 'ready', stats: STATS });
    const card = page.locator('section').filter({ has: page.getByTestId('usage-days') }).last();
    await expect(card).toContainText('319,300');
    await expect(card).toContainText('$0.64');
    await expect(card).toContainText('1.79 GB');
    await expect(card.getByTestId('usage-days')).toContainText('65,6990.57 GB · $0.13');
    // Upstash has not filled in today yet, so its 0 is left out.
    await expect(card.getByTestId('usage-days')).not.toContainText('Fri');
    // Busiest command first; a command with no calls today is left out.
    await expect(card.getByTestId('usage-commands')).toHaveText(/GET.*3,100.*HGET.*2,400/);
    await expect(card.getByTestId('usage-commands')).not.toContainText('DEL');
  });

  test('every bar track has one length', { tag: '@viewport' }, async ({ page }) => {
    await stub(page, { status: 'ready', stats: STATS });
    const tracks = page.locator('[data-testid^="usage-"] .bg-muted');
    await expect(tracks).toHaveCount(3);
    const widths = await tracks.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
    expect(new Set(widths).size, widths.join(', ')).toBe(1);
  });

  // Each read costs the admin rate-limit check plus an MGET, so only the Search tab pays it.
  test('Search data loads on the Search tab, not with every dashboard load', async ({ page }) => {
    const searchReads = await stub(page, { status: 'not_configured' });
    await expect(page.getByText('Not connected')).toBeVisible();
    await page.getByRole('group', { name: 'Date range' }).getByRole('button', { name: '7d' }).click();
    await expect(page.getByRole('group', { name: 'Date range' }).getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true');
    expect(searchReads).toHaveLength(0);
    await page.getByRole('navigation', { name: 'Admin section' }).getByRole('button', { name: 'Search', exact: true }).click();
    await expect.poll(() => searchReads.length).toBe(1);
    // A range change on the Search tab still reloads it.
    await page.getByRole('group', { name: 'Date range' }).getByRole('button', { name: '28d' }).click();
    await expect.poll(() => searchReads.length).toBe(2);
  });

  test('a missing key says the card is not connected', async ({ page }) => {
    await stub(page, { status: 'not_configured' });
    await expect(page.getByText('Not connected')).toBeVisible();
  });
});
