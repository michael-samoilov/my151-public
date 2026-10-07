import { test, expect } from '@playwright/test';

/**
 * The admin Cross-tool tile, in demo mode so CI does not need a token.
 * Locks opportunity percents and the one diagram of every browser in the
 * range, summed over all arrival eras. Inclusive tool totals sit beside
 * the shapes. Exclusive counts sit on the diagram.
 */
test.describe('admin cross-tool tile', () => {
  test('demo dashboard shows opportunity percents and one diagram for all eras', async ({ page }) => {
    await page.goto('/?admin&demo');
    const tile = page.locator('section', { has: page.getByRole('heading', { name: /Cross-tool/ }) });
    await expect(tile.getByText('Dex → League')).toBeVisible();
    await expect(tile.getByText('8%')).toBeVisible();
    await expect(tile.getByText('4 / 50')).toBeVisible();
    await expect(tile.getByText('League has a dex')).toBeVisible();
    await expect(tile.getByText('80%')).toBeVisible();
    await expect(tile.getByText('Only dex Pokémon')).toBeVisible();
    await expect(tile.getByText('75%')).toBeVisible();
    await expect(tile.getByText('After 8 Sep')).toHaveCount(0);
    await expect(tile.getByText('Before 8 Sep')).toHaveCount(0);
    await expect(tile.getByTestId('cross-tool-legend')).toHaveCount(0);
    const names = tile.getByTestId('cross-tool-total');
    await expect(names).toHaveCount(3);
    await expect(names.filter({ hasText: 'Picker 6' })).toBeVisible();
    await expect(names.filter({ hasText: 'Dex 388' })).toBeVisible();
    await expect(names.filter({ hasText: 'League 5' })).toBeVisible();
    const svg = tile.locator('svg[role="img"]');
    await expect(svg).toHaveCount(1);
    await expect(tile.getByTestId('cross-tool-region-label').filter({ hasText: /^384$/ })).toBeVisible();

    await expect(page.getByRole('heading', { name: /Build depth/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /What people pick/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Newest browsers/ })).toHaveCount(0);

    await test.info().attach('cross-tool.svg', {body:await svg.evaluate(el=>el.outerHTML),contentType:'image/svg+xml'});
    await page.getByRole('button', { name: 'Dex', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Cross-tool/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Build depth/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /What people pick/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Newest browsers/ })).toBeVisible();
  });
});

/** Live counts on 7 Oct 2026, summed over the three arrival eras. League + Picker is 0. */
const LEAGUE = Date.UTC(2026, 8, 8);
const PICKER = Date.UTC(2026, 9, 7);
const catalog = [
  { id: 'dex', label: 'Dex builder', short: 'Dex', launchedAt: 0 },
  { id: 'league', label: 'Gym leader maker', short: 'League', launchedAt: LEAGUE },
  { id: 'favorites', label: 'Favorite Pokémon Picker', short: 'Picker', launchedAt: PICKER },
];
const eras = [
  { key: 'before-league', label: 'Arrived before 8 Sep 2026', shortLabel: 'Before 8 Sep', since: null, until: LEAGUE, browsers: 375, regions: { dex: 348, 'dex+league': 27 } },
  { key: 'before-favorites', label: 'Arrived 8 Sep 2026 to 7 Oct 2026', shortLabel: '8 Sep to 7 Oct', since: LEAGUE, until: PICKER, browsers: 514, regions: { 'dex+league': 128, dex: 158, 'dex+favorites': 2, 'dex+favorites+league': 1, league: 224, favorites: 1 } },
  { key: 'since-favorites', label: 'Arrived after 7 Oct 2026', shortLabel: 'After 7 Oct', since: PICKER, until: null, browsers: 12, regions: { dex: 2, 'dex+favorites+league': 3, 'dex+league': 1, 'dex+favorites': 1, league: 3, favorites: 2 } },
];
const counts: Record<string, number> = { dex: 508, league: 227, favorites: 3, 'dex+league': 156, 'dex+favorites': 3, 'favorites+league': 0, 'dex+favorites+league': 4 };

test.describe('cross-tool diagram @viewport', () => {
  test('draws every region at its count share and labels each one once', async ({ page }, testInfo) => {
    const stats = { p50: 0, p75: 0, p90: 0 };
    await page.addInitScript(() => localStorage.setItem('p151-admin-token', 'e2e'));
    await page.route('**/api/search-performance**', (route) => route.fulfill({ status: 503, json: { error: 'off' } }));
    await page.route('**/api/submissions?**', (route) =>
      route.fulfill({
        status: 200,
        json: { totalUsers: 0, offset: 0, limit: 50, funnel: { users: 0, completed: 0, exported: 0 }, retention: { returning: 0, activeLast7: 0, newUsers: 0 }, timeSurvival: [], timeStats: stats, depthSurvival: [], depthStats: stats, countries: {}, devices: {}, os: {}, popularFinal: [], mostDropped: [], popularBySection: {}, droppedBySection: {}, picksBySectionAll: {}, records: [], crossTool: { catalog, kpis: [], eras } },
      }),
    );
    await page.goto('/?admin');
    const chart = page.getByTestId('cross-tool-venns');
    await expect(chart.locator('svg[role="img"]')).toHaveCount(1);
    await expect(chart.getByTestId('cross-tool-region-label')).toHaveCount(6);
    const measured = await chart.locator('svg[role="img"]').evaluate((svg) => {
      const cells = [...svg.querySelectorAll('rect[data-region]')].map((r) => ({
        key: r.getAttribute('data-region') ?? '',
        area: Number(r.getAttribute('width')) * Number(r.getAttribute('height')),
      }));
      const frame = svg.getBoundingClientRect();
      const labels = [...svg.querySelectorAll('text')].map((t) => {
        const b = t.getBoundingClientRect();
        return { text: t.textContent ?? '', left: b.left, right: b.right, top: b.top, bottom: b.bottom };
      });
      let overlaps = 0;
      for (let i = 0; i < labels.length; i++)
        for (let j = i + 1; j < labels.length; j++) {
          const a = labels[i];
          const b = labels[j];
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w > 0.5 && h > 0.5) overlaps++;
        }
      const outside = labels.filter((l) => l.left < frame.left - 0.5 || l.right > frame.right + 0.5 || l.top < frame.top - 0.5 || l.bottom > frame.bottom + 0.5).length;
      return { width: Math.round(frame.width), cells, labels: labels.length, overlaps, outside };
    });
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    const drawn = measured.cells.reduce((s, c) => s + c.area, 0);
    const regions = Object.entries(counts).map(([key, count]) => {
      const area = measured.cells.filter((c) => c.key === key).reduce((s, c) => s + c.area, 0);
      return { key, count, countPct: (count / total) * 100, areaPct: (area / drawn) * 100, cells: measured.cells.filter((c) => c.key === key).length };
    });
    for (const r of regions) {
      expect(Math.abs(r.areaPct - r.countPct), `${r.key}: area share minus count share, in points`).toBeLessThan(0.01);
      expect(r.cells, `${r.key}: one cell per region with browsers, none without`).toBe(r.count > 0 ? 1 : 0);
    }
    expect(measured.overlaps, 'labels that overlap').toBe(0);
    expect(measured.outside, 'labels outside the diagram').toBe(0);
    await testInfo.attach('cross-tool-areas.json', {
      body: JSON.stringify({ width: measured.width, labels: measured.labels, regions: regions.map((r) => ({ ...r, countPct: +r.countPct.toFixed(4), areaPct: +r.areaPct.toFixed(4) })) }, null, 1),
      contentType: 'application/json',
    });
  });
});
