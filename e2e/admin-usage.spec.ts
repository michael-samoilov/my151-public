import { expect, test, type Page } from '@playwright/test';
import { buildDashboard, type DashboardSource } from '../api/_dashboard';

/**
 * The Suite tab's Database card shows Upstash's own numbers, read through
 * `/api/submissions?usage=1`. The stub returns the fields Upstash's
 * "Get Database Stats" sends.
 */

const SOURCE: DashboardSource = {
  clients: {}, archived: [], funnel: {}, funnelWindow: null, leagueClients: {}, exportSurveySkips: null,
};

const point = (x: string, y: number) => ({ x, y });
const STATS = {
  total_monthly_requests: 319_300,
  total_monthly_billing: 0.639,
  total_monthly_bandwidth: 1_786_203_399,
  current_storage: 5_012_345,
  days: ['Thursday', 'Friday'],
  dailyrequests: [point('2026-10-08 00:00:00 +0000 UTC', 65_699), point('2026-10-09 00:00:00 +0000 UTC', 12_000)],
  bandwidths: [point('2026-10-08 00:00:00 +0000 UTC', 570_000_000), point('2026-10-09 00:00:00 +0000 UTC', 90_000_000)],
  dailybilling: [point('2026-10-08 00:00:00 +0000 UTC', 0.131), point('2026-10-09 00:00:00 +0000 UTC', 0.024)],
  command_counts: [
    { metric_identifier: 'HGET', data_points: [point('a', 100), point('b', 2_400)] },
    { metric_identifier: 'GET', data_points: [point('a', 50), point('b', 3_100)] },
    { metric_identifier: 'DEL', data_points: [point('a', 0), point('b', 0)] },
  ],
};

async function stub(page: Page, usage: unknown) {
  await page.route('**/api/submissions?**', (route) => {
    const qs = new URL(route.request().url()).searchParams;
    if (qs.get('usage') === '1') return route.fulfill({ json: usage });
    return route.fulfill({ json: buildDashboard(SOURCE, { offset: 0, limit: 50, range: 'all' }, Date.now()) });
  });
  await page.route('**/api/feedback-list**', (route) => route.fulfill({ json: { items: [], total: 0, offset: 0, limit: 200 } }));
  await page.route('**/api/search-performance**', (route) => route.fulfill({ status: 503, json: { error: 'off' } }));
  await page.addInitScript(() => {
    localStorage.setItem('p151-admin-token', 'e2e');
    localStorage.setItem('p151-admin-range', 'all');
  });
  await page.goto('/?admin');
  await page.getByRole('navigation', { name: 'Admin section' }).getByRole('button', { name: 'Suite', exact: true }).click();
}

test.describe('admin database usage', () => {
  test('the Suite tab shows the month, the days, and today by command', async ({ page }) => {
    await stub(page, { status: 'ready', stats: STATS });
    const card = page.locator('section', { hasText: 'Database' }).filter({ has: page.getByTestId('usage-days') });
    await expect(card).toContainText('319,300');
    await expect(card).toContainText('$0.64');
    await expect(card).toContainText('1.79 GB');
    await expect(card.getByTestId('usage-days')).toContainText('65,699 · 0.57 GB · $0.13');
    // Busiest command first; a command with no calls today is left out.
    await expect(card.getByTestId('usage-commands')).toHaveText(/GET.*3,100.*HGET.*2,400/);
    await expect(card.getByTestId('usage-commands')).not.toContainText('DEL');
  });

  test('a missing key says the card is not connected', async ({ page }) => {
    await stub(page, { status: 'not_configured' });
    await expect(page.getByText('Not connected')).toBeVisible();
  });
});
