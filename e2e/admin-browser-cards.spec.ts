import { expect, test, type Locator, type Page } from '@playwright/test';
import { buildDashboard, type DashboardSource } from '../api/_dashboard';
import { mergeFavoriteRecord, parseFavoriteSnapshot } from '../api/_favoriteRecord';

const MIN = 60_000;
const PLATFORM = { country: 'GB', region: 'ENG', device: 'Mobile', os: 'iOS', browser: 'Safari', tz: 'Europe/London', lang: 'en-GB', locale: 'en' };
type Span = { start: number; end: number };

function dexRecord(cid: string, sessions: Span[], ids: number[]) {
  const last = sessions.at(-1)!;
  return {
    cid, firstTs: sessions[0].start, firstAt: new Date(sessions[0].start).toISOString(), lastTs: last.end, lastAt: new Date(last.end).toISOString(),
    submits: sessions.length * 2, sessions: sessions.length, sessionMs: sessions.map((s) => s.end - s.start),
    sessionLog: sessions.map((s) => ({ ts: s.end, ids })), maxDepth: 3, localHour: 12,
    everIds: ids, latestIds: ids, completed: false, exported: true, ...PLATFORM,
  };
}

function leagueRecord(cid: string, sessions: Span[]) {
  const last = sessions.at(-1)!;
  return {
    cid, firstTs: sessions[0].start, firstAt: new Date(sessions[0].start).toISOString(), lastTs: last.end, lastAt: new Date(last.end).toISOString(),
    submits: sessions.length * 2, sessions: sessions.length, curSessionStart: last.start, maxSessionMs: 0,
    sessionMs: sessions.map((s) => s.end - s.start), sessionLog: sessions.map((s) => ({ ts: s.end })),
    maxCards: 3, maxSeats: 3, latest: { cards: 3, seats: 3, typed: 0, named: 0, aces: 0, leagueNamed: false }, exportsCard: 0, exportsLeague: 0, ...PLATFORM,
  };
}

/** A Picker record from a beacon at the start and the end of each session. */
function pickerRecord(cid: string, sessions: Span[]) {
  const snapshot = parseFavoriteSnapshot({ v: 1, fills: { 'fire|1': 6 } })!;
  let rec: ReturnType<typeof mergeFavoriteRecord> | null = null;
  let n = 0;
  for (const s of sessions) {
    for (const now of [s.start, s.end]) rec = mergeFavoriteRecord(rec, { cid, id: `${cid}-${n++}`, now, kind: 'progress', snapshot, events: [], ...PLATFORM });
  }
  return rec!;
}

/**
 * Four browsers, answered by the server's own buildDashboard.
 * - e2e-three: Dex 0–40, League 30–50, Picker 60–75, one visit. Total 1 session, 1h 5m.
 * - e2e-two: Dex 0–10 and Picker 5–25, then a Picker visit two days later. Total 2 sessions, 33m.
 * - e2e-one: Picker only, so no total.
 * - e2e-arch: archived, Dex and Picker.
 */
async function stub(page: Page) {
  await page.route('**/api/submissions?**', (route) => {
    const now = Date.now();
    const t0 = now - 3 * 60 * MIN;
    const t1 = now - 3 * 24 * 60 * MIN;
    const at = (base: number, a: number, b: number) => ({ start: base + a * MIN, end: base + b * MIN });
    const source: DashboardSource = {
      clients: {
        'e2e-three': JSON.stringify(dexRecord('e2e-three', [at(t0, 0, 40)], [1, 4, 7])),
        'e2e-two': JSON.stringify(dexRecord('e2e-two', [at(t1, 0, 10)], [1, 4, 7])),
        'e2e-arch': JSON.stringify(dexRecord('e2e-arch', [at(t1, 300, 310)], [25])),
      },
      archived: ['e2e-arch'],
      funnel: {},
      funnelWindow: null,
      leagueClients: { 'e2e-three': JSON.stringify(leagueRecord('e2e-three', [at(t0, 30, 50)])) },
      favoriteClients: {
        'e2e-three': JSON.stringify(pickerRecord('e2e-three', [at(t0, 60, 75)])),
        'e2e-two': JSON.stringify(pickerRecord('e2e-two', [at(t1, 5, 25), at(t1, 2 * 24 * 60, 2 * 24 * 60 + 8)])),
        'e2e-one': JSON.stringify(pickerRecord('e2e-one', [at(t1, 100, 112)])),
        'e2e-arch': JSON.stringify(pickerRecord('e2e-arch', [at(t1, 305, 320)])),
      },
      exportSurveySkips: null,
    };
    return route.fulfill({ json: buildDashboard(source, { offset: 0, limit: 50, range: 'all' }, now) });
  });
  await page.route('**/api/search-performance**', (route) => route.fulfill({ status: 503, json: { error: 'off' } }));
  await page.addInitScript(() => {
    localStorage.setItem('p151-admin-token', 'e2e');
    localStorage.setItem('p151-admin-range', 'all');
  });
  await page.goto('/?admin');
}

const card = (page: Page, cid: string) =>
  page.getByRole('link', { name: `Open user ${cid.length <= 8 ? cid : `${cid.slice(0, 2)}…${cid.slice(-4)}`}`, exact: true });

async function chips(c: Locator, selector: string) {
  return c.locator(selector).evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { tool: (e as HTMLElement).dataset.tool, text: e.textContent, x: r.x, y: r.y, w: r.width, clipped: e.scrollWidth > e.clientWidth + 1 };
    }),
  );
}

test.describe('Newest browsers cards @viewport', () => {
  for (const tab of ['Dex', 'League', 'Picker'] as const) {
    test(`a ${tab} card shows every tool of its browser and the merged total`, async ({ page }, testInfo) => {
      await stub(page);
      await page.getByRole('navigation', { name: 'Admin section' }).getByRole('button', { name: tab, exact: true }).click();
      const three = card(page, 'e2e-three');
      await expect(three).toBeVisible();
      const progress = await chips(three, '[data-metric="dex"], [data-metric="league"], [data-metric="picker"]');
      const time = await chips(three, '[data-metric="session"]:not([data-tool="total"])');
      const total = await chips(three, '[data-metric="session"][data-tool="total"]');
      expect(progress.map((p) => p.text)).toEqual(['3/151 Dex', '3/14 Gyms', '1/257 Favs']);
      expect(time.map((t) => [t.tool, t.text])).toEqual([
        ['dex', '1 session · 40m'],
        ['league', '1 session · 20m'],
        ['picker', '1 session · 15m'],
      ]);
      // One visit across three tools: one session, and the minutes Dex and League share count once.
      expect(total.map((t) => t.text)).toEqual(['1 session · 1h 5m']);
      // Each tool's time sits under its progress chip, at the same width; the total ends the row.
      for (const [i, p] of progress.entries()) {
        expect(Math.abs(p.y - progress[0].y)).toBeLessThan(1);
        expect(time[i].y).toBeGreaterThan(p.y + 1);
        expect(Math.abs(time[i].x - p.x)).toBeLessThan(0.6);
        expect(Math.abs(time[i].w - p.w)).toBeLessThan(0.6);
      }
      expect(Math.abs(total[0].y - time[0].y)).toBeLessThan(1);
      expect(total[0].x).toBeGreaterThan(time[2].x + time[2].w);
      for (const c of [...progress, ...time, ...total]) expect(c.clipped).toBe(false);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      if (tab !== 'League') {
        await expect(card(page, 'e2e-two').locator('[data-metric="session"][data-tool="total"]')).toHaveText('2 sessions · 33m');
      }
      if (tab === 'Picker') {
        const one = card(page, 'e2e-one');
        await expect(one.locator('[data-metric="session"][data-tool="picker"]')).toHaveText('1 session · 12m');
        // Every card shows all three tools; the ones this browser never used are greyed.
        await expect(one.locator('[data-metric="dex"]')).toHaveAttribute('data-empty', 'true');
        await expect(one.locator('[data-metric="league"]')).toHaveAttribute('data-empty', 'true');
        await expect(one.locator('[data-metric="picker"]')).not.toHaveAttribute('data-empty', 'true');
        await expect(one.locator('[data-metric="session"][data-tool="total"]')).toHaveText('1 session · 12m');
      }
      await testInfo.attach('three-tool-card.json', { body: JSON.stringify({ progress, time, total }), contentType: 'application/json' });
      await testInfo.attach('three-tool-card.png', { body: await three.screenshot(), contentType: 'image/png' });
    });
  }

  test('on desktop the who chips are as tall as the tool chips, and the bar spans the window', async ({ page }) => {
    test.skip(page.viewportSize()!.width < 1024, 'desktop layout');
    await stub(page);
    await page.getByRole('navigation', { name: 'Admin section' }).getByRole('button', { name: 'Dex', exact: true }).click();
    const three = card(page, 'e2e-three');
    await expect(three).toBeVisible();
    const box = async (l: Locator) => (await l.boundingBox())!;
    const progress = await box(three.locator('[data-metric="dex"]'));
    const time = await box(three.locator('[data-metric="session"][data-tool="dex"]'));
    // Country, device, OS, browser, and language chips, in that order.
    const who = await three.locator('button[data-tooltip-chip]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
    expect(who).toHaveLength(5);
    for (const w of who) {
      expect(Math.abs(w.top - progress.y)).toBeLessThanOrEqual(2);
      expect(Math.abs(w.bottom - (time.y + time.height))).toBeLessThanOrEqual(2);
    }
    const bar = await page.locator('[data-admin-bar]').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, width: r.width, page: document.documentElement.clientWidth };
    });
    expect(bar.left).toBeLessThanOrEqual(0.5);
    expect(Math.abs(bar.width - bar.page)).toBeLessThanOrEqual(1);
    // The date pills stay over the nav, not at the window's left edge.
    const firstPill = await box(page.getByRole('group', { name: 'Date range' }).getByRole('button').first());
    const firstTab = await box(page.getByRole('navigation', { name: 'Admin section' }).getByRole('button').first());
    expect(Math.abs(firstPill.x - firstTab.x)).toBeLessThanOrEqual(24);
  });

  test('an archived browser keeps its Dex chip on the Picker list', async ({ page }, testInfo) => {
    await stub(page);
    await page.getByRole('navigation', { name: 'Admin section' }).getByRole('button', { name: 'Picker', exact: true }).click();
    await page.getByRole('button', { name: 'Archive filter' }).click();
    await page.getByRole('option', { name: 'Archived' }).click();
    const arch = card(page, 'e2e-arch');
    await expect(arch.locator('[data-metric="dex"]')).toHaveText('1/151 Dex');
    await expect(arch.locator('[data-metric="session"][data-tool="total"]')).toHaveText('1 session · 20m');
    await testInfo.attach('archived-card.png', { body: await arch.screenshot(), contentType: 'image/png' });
  });
});
