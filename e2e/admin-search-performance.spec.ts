import { openAdmin } from './admin-ready';
import { expect, test } from '@playwright/test';
import { buildDashboard } from '../api/_dashboard';
import type { SearchProviderSnapshot, SearchSeriesPoint } from '../src/lib/searchPerformance';
import { buildSearchPerformanceView } from '../src/lib/searchPerformanceView';

function searchPanel(page: import('@playwright/test').Page) {
  return page.getByTestId('search-performance');
}

test.describe('admin search performance', () => {
  test.beforeEach(async ({ page }) => {
    await openAdmin(page, '/?admin&demo');
    await expect(page.getByRole('heading', { name: /Analytics/ })).toBeVisible();
  });

  test('keeps search separate from Suite and shows provider and page data', { tag: '@viewport' }, async ({ page }) => {
    const panel = searchPanel(page);
    await expect(panel).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Admin section' }).getByRole('button', { name: 'Search' }).click();
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(panel.getByText('Google ready')).toBeVisible();
    await expect(panel.getByText('Bing ready')).toBeVisible();
    await expect(panel.getByText(/^Current \w{3} \d+–\w{3} \d+$/)).toBeVisible();
    await expect(panel.getByText(/^Through /)).toBeVisible();
    await expect(panel.getByText('Previous —', { exact: true })).toBeVisible();
    await expect(panel.locator('[data-kpi="clicks"]')).toContainText('—');
    await expect(panel.getByText('28d')).toHaveCount(0);
    await expect(panel.getByText('Not final yet: Sep 22–Sep 23', { exact: true })).toBeVisible();

    await expect(panel.getByTestId('search-page-home')).toContainText('Homepage');
    await expect(panel.getByTestId('search-page-pokedex-builder')).toContainText('pokedex builder');
    await expect(panel.getByTestId('search-page-custom-gym-leader')).toContainText('gym leader maker');
    const picker = panel.getByTestId('search-page-favorite-pokemon-picker');
    await expect(picker).toContainText('Favorite Pokémon Picker');
    await expect(picker).toContainText('favorite pokemon picker');
    expect(await picker.getByRole('heading').evaluate((h) => h.scrollWidth <= h.clientWidth)).toBe(true);
    await expect(panel.getByTestId('search-page-favorite-pokemon-by-type')).toHaveCount(0);

    await panel.getByRole('group', { name: 'Search provider' }).getByRole('button', { name: 'Bing' }).click();
    await expect(panel.getByText('make a pokedex')).toBeVisible();

    const ribbon = page.getByRole('group', { name: 'Date range' });
    await ribbon.getByRole('button', { name: '24h' }).click();
    await expect(panel.getByText('Current —', { exact: true })).toBeVisible();
    await expect(panel.getByText(/^Not final yet/)).toHaveCount(0);
    await panel.getByRole('group', { name: 'Search provider' }).getByRole('button', { name: 'Google' }).click();
    await expect(panel.getByText(/^Current \w{3} \d+, \d+ [AP]M–/)).toBeVisible();
    await ribbon.getByRole('button', { name: '7d' }).click();
    await expect(panel.getByText(/^Previous \w{3} \d+–\w{3} \d+$/)).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('each change from the previous period sits beside its figure, as tall as it, unless it cannot fit', { tag: '@viewport' }, async ({ page }) => {
    await page.getByRole('navigation', { name: 'Admin section' }).getByRole('button', { name: 'Search' }).click();
    await page.getByRole('group', { name: 'Date range' }).getByRole('button', { name: '7d' }).click();
    const tiles = searchPanel(page).locator('[data-kpi]');
    await expect(tiles).toHaveCount(4);
    const chips = await tiles.evaluateAll((els) => els.map((tile) => {
      const chip = tile.querySelector('.rounded.bg-muted') as HTMLElement;
      const figure = chip.previousElementSibling as HTMLElement;
      const c = chip.getBoundingClientRect(), f = figure.getBoundingClientRect(), t = tile.getBoundingClientRect();
      const line = parseFloat(getComputedStyle(chip).lineHeight);
      return {
        kpi: tile.getAttribute('data-kpi'),
        parts: chip.children.length,
        partsOnOneLine: [...chip.children].every((part) => part.getBoundingClientRect().height < line * 1.5),
        inside: c.left >= t.left && c.right <= t.right,
        beside: c.left >= f.right,
        sameSpan: Math.abs(c.top - f.top) <= 1 && Math.abs(c.bottom - f.bottom) <= 1,
      };
    }));
    for (const chip of chips) expect(chip, JSON.stringify(chip)).toMatchObject({ partsOnOneLine: true, inside: true });
    // The count changes stack their two parts.
    expect(chips.filter((chip) => chip.kpi === 'clicks' || chip.kpi === 'impressions').map((chip) => chip.parts)).toEqual([2, 2]);
    // Only the narrowest phones lack room beside the figure.
    if (page.viewportSize()!.width >= 360) {
      for (const chip of chips) expect(chip, JSON.stringify(chip)).toMatchObject({ beside: true, sameSpan: true });
    }
  });

  test('counts shorten only when a change would otherwise drop below its figure', async ({ page }) => {
    // A week of 1,252 clicks a day after a week of 635: 8,764 clicks, up 4,319.
    const day = (n: number) => new Date(Date.UTC(2026, 9, 15 + n)).toISOString().slice(0, 10);
    const point = (n: number, clicks: number, impressions: number): SearchSeriesPoint =>
      ({ start: day(n), clicks, impressions, ctr: clicks / impressions, position: 4 });
    const series = [...Array.from({ length: 7 }, (_, n) => point(n, 635, 5_000)), ...Array.from({ length: 7 }, (_, n) => point(n + 7, 1_252, 14_110))];
    const google: SearchProviderSnapshot = {
      provider: 'google', status: 'ready', dataThrough: day(13), series, fresh: [],
      ranges: { '7d': { window: { start: day(7), end: day(13) }, previous: { window: { start: day(0), end: day(6) }, pages: [] }, pages: [], queries: [], pageQueries: [] } },
    };
    const bing: SearchProviderSnapshot = { provider: 'bing', status: 'not_configured', series: [], ranges: {} };
    const view = buildSearchPerformanceView({ daily: { generatedAt: new Date().toISOString(), providers: { google, bing } }, hourly: { generatedAt: new Date().toISOString(), providers: { google: { ...google, ranges: {} } } } });
    const now = Date.now();
    const builder = { cid: 'search-e2e', firstTs: now - 60_000, lastTs: now, submits: 1, sessions: 1, sessionMs: [60_000],
      sessionLog: [{ ts: now - 60_000, ids: [1] }, { ts: now, ids: [1] }], maxDepth: 1, everIds: [1], latestIds: [1], completed: false, exported: false };
    const dashboard = buildDashboard({ clients: { 'search-e2e': JSON.stringify(builder) }, archived: [], funnel: {}, funnelWindow: null, leagueClients: {} }, { range: '7d' }, now);
    await page.route('**/api/submissions?**', (route) => route.fulfill({ json: dashboard }));
    await page.route('**/api/search-performance**', (route) => route.fulfill({ json: view }));
    await page.evaluate(() => localStorage.setItem('p151-admin-token', 'e2e'));
    await openAdmin(page, '/?admin');
    await page.getByRole('navigation', { name: 'Admin section' }).getByRole('button', { name: 'Search' }).click();
    await page.getByRole('group', { name: 'Date range' }).getByRole('button', { name: '7d' }).click();
    const clicks = searchPanel(page).locator('[data-kpi="clicks"]');
    await expect(clicks.locator('.rounded.bg-muted')).toBeVisible();
    const tile = () => clicks.evaluate((el) => {
      const badge = el.querySelector('.rounded.bg-muted') as HTMLElement;
      const figure = badge.previousElementSibling as HTMLElement;
      return { figure: figure.textContent, badge: badge.innerText.split('\n'), beside: badge.getBoundingClientRect().left >= figure.getBoundingClientRect().right };
    });
    // Desktop has room, so the counts stay whole.
    await expect.poll(tile).toEqual({ figure: '8,764', badge: ['+4,319', '+97%'], beside: true });
    // An iPhone 16 is 393px wide: whole counts would push the change below, so they shorten.
    await page.setViewportSize({ width: 393, height: 852 });
    await expect.poll(tile).toEqual({ figure: '8.8K', badge: ['+4.3K', '+97%'], beside: true });
    // Back on desktop, the counts are whole again.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(tile).toEqual({ figure: '8,764', badge: ['+4,319', '+97%'], beside: true });
  });
});
