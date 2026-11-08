import { openAdmin } from './admin-ready';
import { expect, test, type Page } from './support/test';
import { buildDashboard, type DashboardSource } from '../api/_dashboard';
import { isDashboardRange } from '../api/_range';

const DAY = 86_400_000;

function source(now: number): DashboardSource {
  const dex = (cid: string, ts: number) => ({
    cid,
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
  });
  const rows = [dex('e2e-range-a', now - DAY), dex('e2e-range-b', now - 2 * DAY), dex('e2e-range-c', now - 30 * DAY)];
  return {
    clients: Object.fromEntries(rows.map((r) => [r.cid, JSON.stringify(r)])),
    archived: [],
    funnel: { 'intro-shown': '5' },
    funnelWindow: null,
    leagueClients: {},
  };
}

async function stubDashboard(page: Page): Promise<string[]> {
  const asked: string[] = [];
  await page.route('**/api/submissions?**', (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('usage') === '1') return route.fulfill({ json: { status: 'not_configured' } });
    const range = url.searchParams.get('range') ?? 'all';
    asked.push(range);
    const now = Date.now();
    const body = buildDashboard(source(now), { range: isDashboardRange(range) ? range : 'all' }, now);
    return route.fulfill({ json: body });
  });
  await page.route('**/api/search-performance**', (route) => route.fulfill({ status: 503, json: { error: 'off' } }));
  await page.addInitScript(() => localStorage.setItem('p151-admin-token', 'e2e'));
  return asked;
}

test.describe('admin date range', () => {
  test('a press asks for its range once, and a return within a minute asks nothing', async ({ page }, testInfo) => {
    const asked = await stubDashboard(page);
    await openAdmin(page, '/?admin');
    const ribbon = page.getByRole('group', { name: 'Date range' });
    const who = page.getByRole('heading', { name: /^Who/ });
    await expect(ribbon.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    await expect(who).toHaveText(/· 3$/);
    expect(asked).toEqual(['all']);

    await ribbon.getByRole('button', { name: '7d' }).click();
    await expect(ribbon.getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true');
    await expect(who).toHaveText(/· 2$/);
    expect(asked).toEqual(['all', '7d']);

    await ribbon.getByRole('button', { name: 'All' }).click();
    await expect(who).toHaveText(/· 3$/);
    await ribbon.getByRole('button', { name: '7d' }).click();
    await expect(who).toHaveText(/· 2$/);
    expect(asked).toEqual(['all', '7d']);

    await page.reload();
    await expect(ribbon.getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => asked.length).toBe(3);
    expect(asked).toEqual(['all', '7d', '7d']);
    await testInfo.attach('ranges-asked.json', { body: JSON.stringify(asked), contentType: 'application/json' });
  });

  test('the ribbon sits on the nav in one bar', { tag: '@viewport' }, async ({ page }, testInfo) => {
    await openAdmin(page, '/?admin&demo');
    const ribbon = page.getByRole('group', { name: 'Date range' });
    const nav = page.getByRole('navigation', { name: 'Admin section' });
    await expect(ribbon).toBeVisible();
    await expect(nav).toBeVisible();
    await page.mouse.wheel(0, 1500);
    const boxes = await page.evaluate(() => {
      const box = (sel: string) => {
        const r = document.querySelector(sel)!.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      };
      const chips = [...document.querySelectorAll<HTMLElement>('[aria-label="Date range"] button')];
      return {
        ribbon: box('[aria-label="Date range"]'),
        nav: box('nav[aria-label="Admin section"]'),
        bar: box('[data-admin-bar]'),
        navButtons: (() => {
          const b = [...document.querySelectorAll<HTMLElement>('nav[aria-label="Admin section"] button')];
          return { left: b[0].getBoundingClientRect().left, right: b[b.length - 1].getBoundingClientRect().right };
        })(),
        innerWidth: window.innerWidth,
        header: box('header'),
        viewport: window.innerHeight,
        clippedChips: chips.filter((b) => b.scrollWidth > b.clientWidth).length,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    await testInfo.attach('bar.json', { body: JSON.stringify(boxes), contentType: 'application/json' });
    expect(Math.abs(boxes.ribbon.bottom - boxes.nav.top)).toBeLessThanOrEqual(1);
    expect(boxes.clippedChips).toBe(0);
    expect(boxes.pageOverflow).toBeLessThanOrEqual(0);
    const width = page.viewportSize()!.width;
    if (width < 1024) {
      expect(Math.abs(boxes.bar.bottom - boxes.viewport)).toBeLessThanOrEqual(1);
      expect(boxes.viewport - boxes.nav.bottom).toBeGreaterThanOrEqual(13);
      expect(boxes.navButtons.left).toBeGreaterThanOrEqual(12);
      expect(boxes.innerWidth - boxes.navButtons.right).toBeGreaterThanOrEqual(12);
    }
    else expect(Math.abs(boxes.ribbon.top - boxes.header.bottom)).toBeLessThanOrEqual(1);
  });

  test('a user page holds its session scrubber in the ribbon row, with no chips', { tag: '@viewport' }, async ({ page }, testInfo) => {
    await openAdmin(page, '/?admin&demo');
    await page.getByRole('navigation', { name: 'Admin section' }).getByRole('button', { name: 'Dex', exact: true }).click();
    await page.getByRole('link', { name: /Open user 74d5/ }).click();
    const slot = page.locator('[data-admin-range-slot]');
    await expect(slot.getByRole('slider', { name: 'Scrub sessions' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Date range' })).toHaveCount(0);
    const gap = await page.evaluate(() => {
      const dock = document.querySelector('[data-testid="session-scrubber-dock"]')!.getBoundingClientRect();
      const nav = document.querySelector('nav[aria-label="Admin section"]')!.getBoundingClientRect();
      return nav.top - dock.bottom;
    });
    await testInfo.attach('scrubber-gap.json', { body: JSON.stringify({ gap }), contentType: 'application/json' });
    expect(Math.abs(gap)).toBeLessThanOrEqual(1);
  });

  test('Feedback hides the ribbon, and a picks page keeps it under the header', { tag: '@viewport' }, async ({ page }, testInfo) => {
    await openAdmin(page, '/?admin&demo');
    const nav = page.getByRole('navigation', { name: 'Admin section' });
    const ribbon = page.getByRole('group', { name: 'Date range' });
    await nav.getByRole('button', { name: 'Feedback' }).click();
    await expect(ribbon).toHaveCount(0);

    await nav.getByRole('button', { name: 'Dex', exact: true }).click();
    await page.getByRole('button', { name: /Most picked/ }).click();
    await expect(page.getByRole('button', { name: '‹ Back' })).toBeVisible();
    await expect(ribbon).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForFunction(() => window.scrollY > 0);
    const boxes = await page.evaluate(() => {
      const back = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('‹ Back'))!;
      const sticky = back.closest('.sticky')!.getBoundingClientRect();
      const bar = document.querySelector('[data-admin-bar]')!.getBoundingClientRect();
      const header = document.querySelector('header')!.getBoundingClientRect();
      return { stickyTop: sticky.top, barTop: bar.top, barBottom: bar.bottom, headerBottom: header.bottom, scrollY: window.scrollY };
    });
    await testInfo.attach('picks-sticky.json', { body: JSON.stringify(boxes), contentType: 'application/json' });
    expect(boxes.scrollY).toBeGreaterThan(0);
    const width = page.viewportSize()!.width;
    const above = width < 1024 ? boxes.headerBottom : boxes.barBottom;
    expect(Math.abs(boxes.stickyTop - above)).toBeLessThanOrEqual(1);
  });
});
