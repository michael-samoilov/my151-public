import { expect, test, type Page } from '@playwright/test';
import { buildBrowser, buildDashboard, type DashboardSource } from '../api/_dashboard';
import { scrollToRow } from './admin-virtual-list';

/**
 * The Newest browsers lists over the full browser index: every browser is
 * reachable and filterable by scrolling alone, the page holds only the rows
 * near the viewport, and a browser's full records load when its page opens.
 */

const MIN = 60_000;
const N = 1200;
const COUNTRIES = ['US', 'GB', 'DE', 'FR', 'JP', 'BR', 'CA', 'AU'];
/** Rows the page may hold at once, at any width the projects use. */
const MAX_ROWS = 70;

const cidAt = (i: number) => `idx-${String(i).padStart(4, '0')}`;
const leagueOnly = (i: number) => `lg-only-${String(i).padStart(4, '0')}`;
/** The row's accessible name: an id over 8 characters shows its first 2 and last 4. */
const label = (cid: string) => `Open user ${cid.length <= 8 ? cid : `${cid.slice(0, 2)}…${cid.slice(-4)}`}`;

/** Newest first. The oldest 5 are the only New Zealand browsers, and the
 *  oldest 100 carry the widest values: big counts, long times, a long zone. */
function dexRecord(i: number, now: number) {
  const cid = cidAt(i);
  const wide = i >= N - 100;
  const end = now - (i + 1) * 30 * MIN;
  const ms = wide ? 12 * 60 * MIN + 34 * MIN : 20_000;
  const ids = Array.from({ length: wide ? 151 : 1 + (i % 9) }, (_, k) => k + 1);
  return {
    cid, firstTs: end - ms, firstAt: new Date(end - ms).toISOString(), lastTs: end, lastAt: new Date(end).toISOString(),
    submits: 2, sessions: wide ? 99 : 1, sessionMs: [ms], sessionLog: [{ ts: end, ids }], maxDepth: 3, localHour: 12,
    everIds: ids, latestIds: ids, completed: wide, exported: wide,
    country: i >= N - 5 ? 'NZ' : COUNTRIES[i % COUNTRIES.length], device: 'Mobile', os: 'iOS', browser: 'Safari',
    tz: wide ? 'Australia/Adelaide' : 'UTC', lang: 'en-US', locale: 'en',
  };
}

function leagueRecord(cid: string, end: number) {
  return {
    cid, firstTs: end - 20 * MIN, firstAt: new Date(end - 20 * MIN).toISOString(), lastTs: end, lastAt: new Date(end).toISOString(),
    submits: 2, sessions: 1, curSessionStart: end - 20 * MIN, maxSessionMs: 20 * MIN, sessionMs: [20 * MIN], sessionLog: [{ ts: end }],
    maxCards: 3, maxSeats: 3, latest: { cards: 3, seats: 3, typed: 0, named: 0, aces: 0, leagueNamed: false }, exportsCard: 0, exportsLeague: 0,
    country: 'US', device: 'Desktop', os: 'Windows', browser: 'Chrome', tz: 'UTC',
  };
}

/** Answers the dashboard and `?cid=` from one source, as api/submissions.ts
 *  does, and the archive route by updating the archived set. */
async function stub(page: Page) {
  const now = Date.now();
  const clients: Record<string, string> = {};
  for (let i = 0; i < N; i++) clients[cidAt(i)] = JSON.stringify(dexRecord(i, now));
  // A second person on the oldest browser, in another country.
  clients[`${cidAt(N - 1)}::JP`] = JSON.stringify({ ...dexRecord(N - 1, now), cid: `${cidAt(N - 1)}::JP`, country: 'JP', lastTs: now - 5 * MIN });
  const leagueClients: Record<string, string> = {};
  // Every 4th browser also used the League; every 40th used only the League.
  for (let i = 0; i < N; i += 4) leagueClients[cidAt(i)] = JSON.stringify(leagueRecord(cidAt(i), now - (i + 1) * 30 * MIN));
  for (let i = 0; i < 30; i++) leagueClients[leagueOnly(i)] = JSON.stringify(leagueRecord(leagueOnly(i), now - i * 90 * MIN));
  const archived = new Set<string>();
  const source = (): DashboardSource => ({ clients, archived: [...archived], funnel: {}, funnelWindow: null, leagueClients, favoriteClients: {} });
  const asked: string[] = [];
  await page.route('**/api/submissions?**', (route) => {
    const qs = new URL(route.request().url()).searchParams;
    asked.push(qs.toString());
    const cid = qs.get('cid');
    if (!cid) return route.fulfill({ json: buildDashboard(source(), { range: 'all' }, now) });
    const country = qs.get('country');
    const dex = (country && clients[`${cid}::${country}`]) || clients[cid] || null;
    return route.fulfill({ json: buildBrowser(cid, { dex, league: leagueClients[cid] ?? null, favorite: null, exportSurveySkips: null }) });
  });
  await page.route('**/api/archive-entry', (route) => {
    const { cid, archived: on } = route.request().postDataJSON() as { cid: string; archived: boolean };
    if (on) archived.add(cid);
    else archived.delete(cid);
    return route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/search-performance**', (route) => route.fulfill({ status: 503, json: { error: 'off' } }));
  await page.route('**/api/feedback-list**', (route) => route.fulfill({ json: { items: [], total: 0, offset: 0, limit: 200, last7: {}, last30: {} } }));
  await page.addInitScript(() => {
    localStorage.setItem('p151-admin-token', 'e2e');
    localStorage.setItem('p151-admin-range', 'all');
  });
  await page.goto('/?admin');
  return asked;
}

async function openTab(page: Page, tab: 'Dex' | 'League') {
  await page.getByRole('navigation', { name: 'Admin section' }).getByRole('button', { name: tab, exact: true }).click();
}

const rendered = (page: Page) => page.locator('[data-user-preview]').count();

const scrollTo = (page: Page, cid: string) => scrollToRow(page, label(cid));

test.describe('Newest browsers index @viewport', () => {
  test('reaches the oldest of 1,200 browsers by scrolling, holding only the rows near the viewport', async ({ page }, testInfo) => {
    await stub(page);
    await openTab(page, 'Dex');
    await expect(page.getByRole('link', { name: label(cidAt(0)), exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Load more/ })).toHaveCount(0);
    const atTop = await rendered(page);
    const last = await scrollTo(page, cidAt(N - 1));
    const atBottom = await rendered(page);
    expect(atTop).toBeLessThanOrEqual(MAX_ROWS);
    expect(atBottom).toBeLessThanOrEqual(MAX_ROWS);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await testInfo.attach('rendered-rows.json', { body: JSON.stringify({ browsers: N + 1, atTop, atBottom }), contentType: 'application/json' });
    await testInfo.attach('oldest-row.png', { body: await last.screenshot(), contentType: 'image/png' });
  });

  test('the header stays on screen over the scrolling rows, each cell over its column', async ({ page }, testInfo) => {
    await stub(page);
    await openTab(page, 'Dex');
    await scrollTo(page, cidAt(600));
    const stuck = await page.evaluate(() => {
      const hdr = document.querySelector<HTMLElement>('[data-preview-header]')!;
      // The header reads both heights through inheritance.
      const root = getComputedStyle(hdr);
      const px = (name: string) => parseFloat(root.getPropertyValue(name)) || 0;
      const desktop = innerWidth >= 1024;
      const box = hdr.getBoundingClientRect();
      // Rows scroll under the header, so its middle shows the header, not a row,
      // and so does the panel padding beside it, where a row's shadow would show.
      const mid = box.top + box.height / 2;
      const hits = [box.left + box.width / 2, box.left - 8, box.right + 8].map((x) => document.elementFromPoint(x, mid));
      const row = [...document.querySelectorAll<HTMLElement>('[data-user-preview]')].find((r) => r.getBoundingClientRect().top >= box.bottom)!;
      const edges = (el: Element | undefined) => (el ? [Math.round(el.getBoundingClientRect().left), Math.round(el.getBoundingClientRect().right)] : null);
      // The exact class, so md:col-start-1 does not also match md:col-start-10.
      const inCol = (scope: Element, c: string) => [...scope.querySelectorAll('*')].find((e) => e.classList.contains(c));
      const cols = ['md:col-start-1', 'md:col-start-2', 'md:col-start-3', 'md:col-start-4', 'md:col-start-5', 'md:col-start-6'];
      return {
        top: box.top,
        line: px('--admin-header-h') + (desktop ? px('--admin-bar-h') : 0),
        onTop: hits.map((h) => !!h?.closest('[data-preview-header]')),
        desktop,
        header: desktop ? cols.map((c) => edges(inCol(hdr, c))) : [],
        row: desktop ? cols.map((c) => edges(inCol(row, c))) : [],
      };
    });
    expect(Math.abs(stuck.top - stuck.line), JSON.stringify(stuck)).toBeLessThanOrEqual(1);
    expect(stuck.onTop).toEqual([true, true, true]);
    expect(stuck.header).toEqual(stuck.row);
    await testInfo.attach('sticky-header.json', { body: JSON.stringify(stuck), contentType: 'application/json' });
    await testInfo.attach('sticky-header.png', { body: await page.screenshot(), contentType: 'image/png' });
  });
});

test('desktop table columns hold still while rows of other widths scroll in', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await stub(page);
  await openTab(page, 'Dex');
  // Each column's left edge, read from the first row on screen.
  const columns = () =>
    page.evaluate(() => {
      const rows = [...document.querySelectorAll<HTMLElement>('[data-user-preview]')];
      const row = rows.find((r) => r.getBoundingClientRect().top >= 0) ?? rows[0];
      const x = (sel: string) => Math.round(row.querySelector<HTMLElement>(sel)!.getBoundingClientRect().left * 10) / 10;
      return {
        when: x('span'),
        country: x('[class*="md:col-start-2"]'),
        device: x('[class*="md:col-start-3"]'),
        os: x('[class*="md:col-start-4"]'),
        browser: x('[class*="md:col-start-5"]'),
        language: x('[class*="md:col-start-6"]'),
        dex: x('[data-metric="dex"]'),
        league: x('[data-metric="league"]'),
        picker: x('[data-metric="picker"]'),
        total: x('[data-metric="session"][data-tool="total"]'),
      };
    });
  const top = await columns();
  await scrollTo(page, cidAt(600));
  const middle = await columns();
  await scrollTo(page, cidAt(N - 1));
  const bottom = await columns();
  expect(middle).toEqual(top);
  expect(bottom).toEqual(top);
  await testInfo.attach('columns.json', { body: JSON.stringify({ top, middle, bottom }), contentType: 'application/json' });
});

test('filters and archive reach browsers far below the first screen', async ({ page }, testInfo) => {
  await stub(page);
  await openTab(page, 'Dex');
  await page.getByRole('button', { name: 'Country', exact: true }).click();
  await page.getByRole('option', { name: 'New Zealand' }).click();
  await expect(page.locator('[data-user-preview]')).toHaveCount(5);
  await page.getByRole('button', { name: 'Clear Country' }).click();

  await openTab(page, 'League');
  await page.getByRole('button', { name: 'Tool filter' }).click();
  await page.getByRole('option', { name: 'League', exact: true }).click();
  await scrollTo(page, leagueOnly(29));
  const names = await page.locator('[data-user-preview]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) expect(name).toMatch(/^Open user (lg…\d{4}|idx-\d{4})$/);
  await page.getByRole('button', { name: 'Clear Tools' }).click();
  await page.evaluate(() => window.scrollTo(0, 0));

  await openTab(page, 'Dex');
  const oldest = await scrollTo(page, cidAt(N - 1));
  await oldest.getByRole('button', { name: 'Archive user' }).click();
  await expect(page.getByRole('link', { name: label(cidAt(N - 1)), exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Archive filter' }).click();
  await page.getByRole('option', { name: 'Archived' }).click();
  // The browser's country-split record is archived with it.
  await expect(page.locator('[data-user-preview]')).toHaveCount(2);
  await testInfo.attach('archived.png', { body: await page.locator('[data-user-preview]').first().screenshot(), contentType: 'image/png' });
});

test('opening a row loads that browser, and a country-split row loads its own record', async ({ page }, testInfo) => {
  const asked = await stub(page);
  await openTab(page, 'Dex');
  const split = page.getByRole('link', { name: label(`${cidAt(N - 1)}::JP`), exact: true });
  await split.click();
  await expect(page.getByRole('button', { name: '‹ Back' })).toBeVisible();
  expect(asked).toContain(`cid=${cidAt(N - 1)}&country=JP`);
  await page.getByRole('button', { name: '‹ Back' }).click();

  const oldest = await scrollTo(page, cidAt(N - 1));
  await oldest.click();
  await expect(page.getByRole('group', { name: "This browser's tools" }).first()).toBeVisible();
  expect(asked).toContain(`cid=${cidAt(N - 1)}`);
  await testInfo.attach('cid-requests.json', { body: JSON.stringify(asked.filter((q) => q.startsWith('cid='))), contentType: 'application/json' });
});
