import { expect, test, type Page } from '@playwright/test';
import { buildBrowser, buildDashboard, type DashboardSource } from '../api/_dashboard';

/**
 * Feedback reports link to the browser that sent them, and back.
 *
 * - e2e-fb-both: Dex and League. Two reports, one from the league card, one
 *   from the hub, both sent during its sessions.
 * - e2e-fb-dex: Dex only. One report from the Picker, so its link falls back
 *   to Dex.
 * - e2e-fb-old: Dex only, behind 48 newer fillers, so it is the 51st Dex
 *   browser and not on the loaded page of 50. Its page loads it on demand.
 * - e2e-fb-gone: no tool record anywhere.
 */

const MIN = 60_000;
const PLATFORM = { country: 'GB', device: 'Mobile', os: 'iOS', browser: 'Safari', tz: 'Europe/London', lang: 'en-GB', locale: 'en' };
type Span = { start: number; end: number };

function dexRecord(cid: string, sessions: Span[]) {
  const last = sessions.at(-1)!;
  return {
    cid, firstTs: sessions[0].start, firstAt: new Date(sessions[0].start).toISOString(), lastTs: last.end, lastAt: new Date(last.end).toISOString(),
    submits: sessions.length * 2, sessions: sessions.length, sessionMs: sessions.map((s) => s.end - s.start),
    sessionLog: sessions.map((s, i) => ({ ts: s.end, ids: [1, 4, 7].slice(0, i + 1) })), maxDepth: 3, localHour: 12,
    everIds: [1, 4, 7], latestIds: [1, 4, 7], completed: false, exported: false, ...PLATFORM,
  };
}

const SUMMARY = { cards: 3, seats: 3, typed: 0, named: 0, aces: 0, leagueNamed: false };

function leagueRecord(cid: string, sessions: Span[]) {
  const last = sessions.at(-1)!;
  return {
    cid, firstTs: sessions[0].start, firstAt: new Date(sessions[0].start).toISOString(), lastTs: last.end, lastAt: new Date(last.end).toISOString(),
    submits: sessions.length * 2, sessions: sessions.length, curSessionStart: last.start, maxSessionMs: 0,
    sessionMs: sessions.map((s) => s.end - s.start), sessionLog: sessions.map((s, i) => ({ ts: s.end, summary: { ...SUMMARY, cards: i + 1, seats: i + 1 } })),
    maxCards: 3, maxSeats: 3, latest: SUMMARY, exportsCard: 0, exportsLeague: 0, ...PLATFORM,
  };
}

async function stub(page: Page) {
  const now = Date.now();
  const t0 = now - 3 * 24 * 60 * MIN;
  const at = (a: number, b: number) => ({ start: t0 + a * MIN, end: t0 + b * MIN });
  const visits = [at(0, 20), at(24 * 60, 24 * 60 + 30), at(48 * 60, 48 * 60 + 10)];
  const source: DashboardSource = {
    clients: {
      'e2e-fb-both': JSON.stringify(dexRecord('e2e-fb-both', visits)),
      'e2e-fb-dex': JSON.stringify(dexRecord('e2e-fb-dex', [at(5, 25)])),
      ...Object.fromEntries(
        Array.from({ length: 48 }, (_, i) => [`e2e-fill-${i}`, JSON.stringify(dexRecord(`e2e-fill-${i}`, [at(100 + i, 110 + i)]))]),
      ),
      'e2e-fb-old': JSON.stringify(dexRecord('e2e-fb-old', [at(-600, -590), at(-300, -280)])),
    },
    archived: [],
    funnel: {},
    funnelWindow: null,
    leagueClients: { 'e2e-fb-both': JSON.stringify(leagueRecord('e2e-fb-both', visits)) },
    exportSurveySkips: null,
  };
  const report = (id: string, cid: string, route: string, ts: number) => ({
    id, ts, category: 'bug', message: `report ${id}`, cid, context: { route, locale: 'en' },
  });
  const items = [
    report('r-gone', 'e2e-fb-gone', 'league', t0 + 50 * 60 * MIN),
    report('r-card', 'e2e-fb-both', 'league-card', t0 + (24 * 60 + 15) * MIN),
    report('r-dex', 'e2e-fb-dex', '/favorite-pokemon-picker', t0 + 20 * MIN),
    report('r-home', 'e2e-fb-both', 'home', t0 + 10 * MIN),
    report('r-old', 'e2e-fb-old', 'league', t0 - 285 * MIN),
  ];
  let feedbackCalls = 0;
  await page.route('**/api/submissions?**', (route) => {
    const cid = new URL(route.request().url()).searchParams.get('cid');
    if (!cid) return route.fulfill({ json: buildDashboard(source, { offset: 0, limit: 50, range: 'all' }, now) });
    const dex = source.clients?.[cid] ?? null;
    const league = source.leagueClients?.[cid] ?? null;
    return route.fulfill({ json: buildBrowser(cid, { dex, league, favorite: null, exportSurveySkips: null }) });
  });
  await page.route('**/api/feedback-list**', (route) => {
    feedbackCalls++;
    return route.fulfill({ json: { items, total: items.length, offset: 0, limit: 200, last7: { bug: 4 }, last30: { bug: 4 } } });
  });
  await page.route('**/api/search-performance**', (route) => route.fulfill({ status: 503, json: { error: 'off' } }));
  await page.addInitScript(() => {
    localStorage.setItem('p151-admin-token', 'e2e');
    localStorage.setItem('p151-admin-range', 'all');
  });
  await page.goto('/?admin');
  return { calls: () => feedbackCalls };
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Admin section' });
const report = (page: Page, id: string) => page.locator('li', { hasText: `report ${id}` });
const tools = (page: Page) => page.getByRole('group', { name: "This browser's tools" });

test.describe('admin feedback links', () => {
  test('a report opens its browser on the tool it was sent from', async ({ page }) => {
    await stub(page);
    await nav(page).getByRole('button', { name: 'Feedback', exact: true }).click();

    await expect(report(page, 'r-gone')).toBeVisible();
    await expect(report(page, 'r-dex').getByTestId('feedback-open-browser')).toHaveAttribute('data-tool', 'dex');
    await expect(report(page, 'r-home').getByTestId('feedback-open-browser')).toHaveAttribute('data-tool', 'dex');

    await report(page, 'r-card').getByTestId('feedback-open-browser').click();
    await expect(page.getByRole('button', { name: '‹ Back' })).toBeVisible();
    await expect(tools(page).getByRole('button', { name: 'League', pressed: true })).toBeVisible();

    await page.getByRole('button', { name: '‹ Back' }).click();
    await expect(report(page, 'r-card')).toBeVisible();
  });

  test('the session chart marks each report on the milestone row', async ({ page }) => {
    const { calls } = await stub(page);
    await nav(page).getByRole('button', { name: 'Dex', exact: true }).click();
    await page.getByRole('link', { name: /Open user e2…both/ }).click();
    // The hub report snaps to the first visit, the card report to the second.
    await expect(page.getByTestId('session-feedback-mark')).toHaveCount(2);
    await tools(page).getByRole('button', { name: 'League', exact: true }).click();
    await expect(page.getByTestId('session-feedback-mark')).toHaveCount(2);
    await page.getByRole('slider', { name: 'Scrub sessions' }).fill('1');
    await expect(page.getByTestId('session-playhead-milestone')).toHaveText('feedback');
    // The user page and the Feedback tab share one fetch.
    await nav(page).getByRole('button', { name: 'Feedback', exact: true }).click();
    await expect(report(page, 'r-card')).toBeVisible();
    expect(calls()).toBe(1);
  });

  // The chip sits in the who row on desktop and ends the tool row on a phone.
  test('the who-row chip opens the Feedback tab on that browser', { tag: '@viewport' }, async ({ page }) => {
    await stub(page);
    await nav(page).getByRole('button', { name: 'Dex', exact: true }).click();
    await page.getByRole('link', { name: /Open user e2…both/ }).click();
    const chip = page.getByTestId('admin-feedback-chip').locator('visible=true');
    await expect(chip).toHaveText('2');
    await chip.click();

    await expect(nav(page).getByRole('button', { name: 'Feedback', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const filter = page.getByTestId('feedback-browser-filter');
    await expect(filter).toContainText('e2…both');
    await expect(report(page, 'r-card')).toBeVisible();
    await expect(report(page, 'r-home')).toBeVisible();
    await expect(report(page, 'r-gone')).toHaveCount(0);

    await filter.click();
    await expect(filter).toHaveCount(0);
    await expect(report(page, 'r-gone')).toBeVisible();
  });

  test('a sender outside the newest 50 opens, and loads on demand', async ({ page }) => {
    await stub(page);
    await nav(page).getByRole('button', { name: 'Feedback', exact: true }).click();

    const old = report(page, 'r-old').getByTestId('feedback-open-browser');
    await expect(old).toHaveText('Open browser');
    await old.click();
    // The report came from League, which this browser never used: Dex opens.
    await expect(tools(page).getByRole('button', { name: 'Dex', pressed: true })).toBeVisible();
    await expect(page.getByTestId('admin-feedback-chip').locator('visible=true')).toHaveText('1');
    await expect(page.getByTestId('session-feedback-mark')).toHaveCount(1);

    await page.getByRole('button', { name: '‹ Back' }).click();
    await report(page, 'r-gone').getByTestId('feedback-open-browser').click();
    await expect(page.getByTestId('admin-user-status')).toContainText('No tool records for this browser.');
  });
});
