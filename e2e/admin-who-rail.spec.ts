import { expect, test } from '@playwright/test';
import { buildDashboard, type DashboardSource } from '../api/_dashboard';

// One browser in each of these countries, so nearly every flag folds into the
// Who card's Other rail. Laying out that many rows once froze the page.
const COUNTRIES = (
  'AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG ' +
  'CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FR GA GB GD GE GH GM ' +
  'GN GQ GR GT GW GY HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KR KW KZ LA LB'
).split(' ');

function source(now: number): DashboardSource {
  const rows = COUNTRIES.map((country, i) => ({
    cid: `e2e-who-${country}`,
    firstTs: now - (i + 1) * 60_000,
    firstAt: new Date(now - (i + 1) * 60_000).toISOString(),
    lastTs: now - (i + 1) * 60_000,
    lastAt: new Date(now - (i + 1) * 60_000).toISOString(),
    submits: 1,
    sessions: 1,
    sessionMs: [60_000],
    sessionLog: [{ ts: now - (i + 1) * 60_000, ids: [1, 4, 7] }],
    maxDepth: 3,
    localHour: 12,
    tz: 'UTC',
    country,
    device: 'Mobile',
    os: 'iOS',
    browser: 'Safari',
    everIds: [1, 4, 7],
    latestIds: [1, 4, 7],
    completed: false,
    exported: false,
  }));
  return {
    clients: Object.fromEntries(rows.map((r) => [r.cid, JSON.stringify(r)])),
    archived: [],
    funnel: {},
    funnelWindow: null,
    leagueClients: {},
  };
}

test.describe('admin Who Other rail', { tag: '@viewport' }, () => {
  test('wraps the folded flags of 96 countries inside the card, top row longest', async ({ page }, testInfo) => {
    await page.route('**/api/submissions?**', (route) => {
      const now = Date.now();
      return route.fulfill({ json: buildDashboard(source(now), { range: 'all' }, now) });
    });
    await page.route('**/api/search-performance**', (route) => route.fulfill({ status: 503, json: { error: 'off' } }));
    await page.addInitScript(() => localStorage.setItem('p151-admin-token', 'e2e'));
    await page.goto('/?admin');
    const rail = page.locator('[data-who-other="flag"]');
    await expect(rail.locator('[data-who-rail-row]').nth(1)).toBeVisible();
    const layout = await rail.evaluate((el) => {
      const rowEls = [...el.querySelectorAll('[data-who-rail-row]')];
      const host = rowEls[0].parentElement!.getBoundingClientRect();
      const rows = rowEls.map((row) => {
        const boxes = [...row.querySelectorAll('[data-who-rail-label]')].map((label) => label.getBoundingClientRect());
        const left = Math.min(...boxes.map((b) => b.left));
        const right = Math.max(...boxes.map((b) => b.right));
        return { labels: boxes.length, left, right, width: right - left };
      });
      return { host: { left: host.left, right: host.right }, rows };
    });
    await testInfo.attach('who-rail.json', { body: JSON.stringify(layout), contentType: 'application/json' });
    const [top, ...lower] = layout.rows;
    for (const row of layout.rows.filter((r) => r.labels > 1)) {
      expect(row.left).toBeGreaterThanOrEqual(layout.host.left - 0.5);
      expect(row.right).toBeLessThanOrEqual(layout.host.right + 0.5);
    }
    for (const row of lower) expect(top.width).toBeGreaterThan(row.width);
  });
});
