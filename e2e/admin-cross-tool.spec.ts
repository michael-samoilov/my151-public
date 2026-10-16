import { openAdmin } from './admin-ready';
import { test, expect } from '@playwright/test';

/**
 * The admin Cross-tool tile, in demo mode so CI does not need a token.
 * Locks the one diagram of every browser in the
 * range, summed over all arrival eras. Inclusive tool totals sit beside
 * the shapes. Exclusive counts sit on the diagram.
 */
test.describe('admin cross-tool tile', () => {
  test('demo dashboard shows only the diagram for all eras, no percent row', async ({ page }) => {
    await openAdmin(page, '/?admin&demo');
    const tile = page.locator('section', { has: page.getByRole('heading', { name: /Cross-tool/ }) });
    // Michael removed the percent row on 8 October; the diagram alone stays.
    await expect(tile.getByTestId('cross-tool-venns')).toBeVisible();
    await expect(tile.getByText('Dex → League')).toHaveCount(0);
    await expect(tile.getByText('League has a dex')).toHaveCount(0);
    await expect(tile.getByText('Only dex Pokémon')).toHaveCount(0);
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
        json: { totalUsers: 0, funnel: { users: 0, completed: 0, exported: 0 }, retention: { returning: 0, newUsers: 0 }, timeSurvival: [], timeStats: stats, depthSurvival: [], depthStats: stats, countries: {}, devices: {}, os: {}, popularFinal: [], mostDropped: [], popularBySection: {}, droppedBySection: {}, picksBySectionAll: {}, crossTool: { catalog, kpis: [], eras } },
      }),
    );
    await openAdmin(page, '/?admin');
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

/** A launch chip narrows the card to the matching `crossToolSince` snapshot. */
const kpi = (n: number, of: number) => ({ key: 'dex-to-league', label: 'Dex → League', hint: 'of dex users active after 8 Sep 2026', n, of, pct: Math.round((n / of) * 100) });
const snapshot = (regions: Record<string, number>, conv: [number, number]) => ({
  catalog,
  kpis: [kpi(...conv)],
  eras: [{ key: 'since-league', label: 'Arrived after 8 Sep 2026', shortLabel: 'After 8 Sep', since: LEAGUE, until: null, browsers: Object.values(regions).reduce((s, n) => s + n, 0), regions }],
});
const crossToolSince = {
  league: snapshot({ dex: 160, league: 227, 'dex+league': 129, 'dex+favorites': 3, 'dex+favorites+league': 4, favorites: 3 }, [129, 289]),
  favorites: snapshot({ dex: 2, league: 3, 'dex+league': 1, 'dex+favorites': 1, 'dex+favorites+league': 3, favorites: 2 }, [4, 6]),
};

test.describe('cross-tool launch chips @viewport', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('a chip narrows the card to its snapshot and leaves the date range alone', async ({ page }, testInfo) => {
    const stats = { p50: 0, p75: 0, p90: 0 };
    const asked: string[] = [];
    await page.addInitScript(() => localStorage.setItem('p151-admin-token', 'e2e'));
    await page.route('**/api/search-performance**', (route) => route.fulfill({ status: 503, json: { error: 'off' } }));
    await page.route('**/api/submissions?**', (route) => {
      asked.push(new URL(route.request().url()).searchParams.get('range') ?? '');
      return route.fulfill({
        status: 200,
        json: { totalUsers: 0, funnel: { users: 0, completed: 0, exported: 0 }, retention: { returning: 0, newUsers: 0 }, timeSurvival: [], timeStats: stats, depthSurvival: [], depthStats: stats, countries: {}, devices: {}, os: {}, popularFinal: [], mostDropped: [], popularBySection: {}, droppedBySection: {}, picksBySectionAll: {}, crossTool: { catalog, kpis: [kpi(156, 333)], eras }, crossToolSince },
      });
    });
    await openAdmin(page, '/?admin');
    const tile = page.locator('section', { has: page.getByRole('heading', { name: /Cross-tool/ }) });
    const chips = tile.getByRole('group', { name: 'Since launch' }).getByRole('button');
    const leagueChip = chips.filter({ hasText: 'League 7 Sep' });
    const pickerChip = chips.filter({ hasText: 'Picker 6 Oct' });
    await expect(chips).toHaveCount(2);
    await expect(leagueChip).toHaveAttribute('aria-pressed', 'false');
    await expect(pickerChip).toHaveAttribute('aria-pressed', 'false');
    const ribbon = page.getByRole('group', { name: 'Date range' });
    const rangeBefore = await ribbon.locator('[aria-pressed="true"]').textContent();
    const requestsBefore = asked.length;

    const read = async () => ({
      browsers: (await tile.getByText(/^\d+ browsers$/).textContent()) ?? '',
      totals: await tile.getByTestId('cross-tool-total').allTextContents(),
      range: (await ribbon.locator('[aria-pressed="true"]').textContent()) ?? '',
    });
    const states: Record<string, Awaited<ReturnType<typeof read>>> = { none: await read() };
    expect(states.none.browsers).toBe('901 browsers');

    await leagueChip.click();
    await expect(leagueChip).toHaveAttribute('aria-pressed', 'true');
    await expect(tile.getByText('526 browsers')).toBeVisible();
    states.league = await read();
    expect(states.league.totals).toEqual(['Dex 296', 'League 360', 'Picker 10']);

    await pickerChip.click();
    await expect(pickerChip).toHaveAttribute('aria-pressed', 'true');
    await expect(leagueChip).toHaveAttribute('aria-pressed', 'false');
    await expect(tile.getByText('12 browsers')).toBeVisible();
    states.favorites = await read();
    expect(states.favorites.totals).toEqual(['Dex 7', 'League 7', 'Picker 6']);

    await pickerChip.click();
    await expect(pickerChip).toHaveAttribute('aria-pressed', 'false');
    await expect(tile.getByText('901 browsers')).toBeVisible();

    // The chips fit on one line, whole, at every width.
    const fit = await chips.evaluateAll((els) =>
      els.map((el) => ({ top: Math.round(el.getBoundingClientRect().top), cut: el.scrollWidth > el.clientWidth, lines: Math.round(el.getBoundingClientRect().height) })),
    );
    expect(new Set(fit.map((f) => f.top)).size, 'chips on one line').toBe(1);
    expect(fit.filter((f) => f.cut), 'chips cut short').toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

    for (const s of Object.values(states)) expect(s.range).toBe(rangeBefore);
    expect(asked.length, 'no new request for a chip').toBe(requestsBefore);
    await testInfo.attach('cross-tool-chips.json', { body: JSON.stringify({ states, fit, requests: asked }, null, 1), contentType: 'application/json' });
  });
});
