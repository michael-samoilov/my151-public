import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { filledSlotsLeague, fiveLineCardLeague, sevenGymsLeague } from './support/leagueSeed';

type EventBody = { event?: string; cid?: string; tool?: string; page?: string };

async function collectEvents(page: Page): Promise<EventBody[]> {
  const events: EventBody[] = [];
  await page.route('**/api/event', async (route) => {
    if (route.request().method() === 'POST') {
      events.push(route.request().postDataJSON() as EventBody);
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.route('**/api/league', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  return events;
}

async function seatSixthLine(page: Page) {
  await page.click('[data-testid="league-slot-0"]');
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(400);
  await page.click('[data-testid="card-cell-11-6"]');
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')];
    const el = inputs[inputs.length - 1];
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setValue.call(el, 'eevee');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(700);
  await page.click('[data-testid="verify-evo-card"]');
  await page.waitForTimeout(400);
}

async function seatLine(page: Page, slot: number, query: string) {
  await page.click(`[data-testid="league-slot-${slot}"]`);
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(400);
  await page.click('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(600);
  await page.evaluate((name) => {
    const inputs = [...document.querySelectorAll('input')];
    const el = inputs[inputs.length - 1];
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setValue.call(el, name);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, query);
  await page.waitForTimeout(700);
  await page.click('[data-testid="verify-evo-card"]');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Back to the league/ }).click();
  await page.waitForSelector('[data-testid="league-slot-0"]');
}

function nudgeEvents(events: EventBody[]) {
  return events.filter((e) => typeof e.event === 'string' && e.event.startsWith('league-nudge-'));
}

const tip = (page: Page) => page.getByTestId('tip-card');

async function expectNoFollowUpNudge(page: Page) {
  await page.waitForTimeout(1500);
  await expect(tip(page)).toHaveCount(0);
}

async function attachRosterState(page: Page, testInfo: TestInfo, events: EventBody[]) {
  const celebrated = await page.evaluate(
    () => JSON.parse(localStorage.getItem('league-builder') ?? '{}')?.state?.celebratedNudges,
  );
  await testInfo.attach('roster-nudges.json', {
    body: JSON.stringify({ events: nudgeEvents(events).map((e) => e.event), celebrated }, null, 2),
    contentType: 'application/json',
  });
}

test.describe('league funnel export nudges', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a sixth evolution line on a trainer card suggests exporting the card', async ({ page }) => {
    const events = await collectEvents(page);
    await fiveLineCardLeague(page);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await seatSixthLine(page);
    const nudge = tip(page);
    await expect(nudge).toBeVisible({ timeout: 5000 });
    await expect(nudge).toHaveAttribute('data-tip-card', 'league-card');
    await expect.poll(() => nudgeEvents(events).map((e) => e.event)).toEqual([
      'league-nudge-card-shown',
    ]);
    expect(nudgeEvents(events)[0]).toMatchObject({
      event: 'league-nudge-card-shown',
      tool: 'league',
      page: '/custom-gym-leader',
    });
    expect(nudgeEvents(events)[0]?.cid).toMatch(/\S{8,}/);
    await nudge.getByRole('button', { name: 'Export trainer card' }).click();
    await expect(page.locator('[data-export-preview-layer]')).toBeVisible({ timeout: 45_000 });
    await expect.poll(() => nudgeEvents(events).map((e) => e.event)).toEqual([
      'league-nudge-card-shown',
      'league-nudge-card-cta',
    ]);
    await expect(tip(page)).toHaveCount(0);
  });

  test('eight gym leaders with a card still empty suggest exporting now or later', async ({ page }, testInfo) => {
    const events = await collectEvents(page);
    await sevenGymsLeague(page);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await seatLine(page, 7, 'pikachu');
    const nudge = tip(page);
    await expect(nudge).toBeVisible({ timeout: 5000 });
    await expect(nudge).toHaveAttribute('data-tip-card', 'league-gyms');
    const exportButton = page.locator('[data-league-export="league"]');
    await expect(exportButton.locator('[data-tip-dot]')).toBeVisible();
    await expect(exportButton).toHaveCSS('animation-name', 'none');
    const geo = await page.evaluate(() => {
      const n = document.querySelector('[data-testid="tip-card"]')!.getBoundingClientRect();
      const summary = document.querySelector('[data-lg-league-root]')!.getBoundingClientRect();
      const rows = [...Array(14)].map((_, i) =>
        document.querySelector(`[data-testid="league-slot-${i}"]`)!.getBoundingClientRect());
      return {
        summaryTop: summary.top,
        summaryHeight: summary.height,
        rowsOnScreen: rows.filter((r) => r.top >= 0 && r.bottom <= innerHeight).length,
        popupBottom: n.bottom,
        viewportHeight: innerHeight,
      };
    });
    await testInfo.attach('roster-popup-floats.json', { body: JSON.stringify(geo, null, 2), contentType: 'application/json' });
    expect(geo.rowsOnScreen).toBe(14);
    expect(geo.popupBottom).toBeLessThanOrEqual(geo.viewportHeight);
    await expect(nudge).toContainText('Gym leaders complete');
    await expect(nudge).not.toContainText(/toolbar/i);
    await expect(nudge.getByRole('button', { name: 'Export league' })).toBeVisible();
    await expect.poll(() => nudgeEvents(events).map((e) => e.event)).toEqual([
      'league-nudge-league-shown',
    ]);
    await nudge.getByRole('button', { name: 'Dismiss' }).click();
    await expect(tip(page)).toHaveCount(0);
    const closed = await page.evaluate(() => {
      const summary = document.querySelector('[data-lg-league-root]')!.getBoundingClientRect();
      return { summaryTop: summary.top, summaryHeight: summary.height };
    });
    expect(closed, 'the popup floats, so the roster does not move when it closes').toEqual({ summaryTop: geo.summaryTop, summaryHeight: geo.summaryHeight });
    await expect(exportButton.locator('[data-tip-dot]'), 'the dot stays after the tip closes').toBeVisible();
    await expect.poll(() => nudgeEvents(events).map((e) => e.event)).toEqual([
      'league-nudge-league-shown',
      'league-nudge-league-dismiss',
    ]);
    await attachRosterState(page, testInfo, events);
  });

  test('the last empty card suggests exporting the full league, once', async ({ page }, testInfo) => {
    const events = await collectEvents(page);
    await filledSlotsLeague(page, [0, 1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13]);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await seatLine(page, 7, 'pikachu');
    const gyms = tip(page);
    await expect(gyms).toHaveAttribute('data-tip-card', 'league-gyms', { timeout: 5000 });
    await gyms.getByRole('button', { name: 'Dismiss' }).click();
    await seatLine(page, 8, 'eevee');
    const full = tip(page);
    await expect(full).toBeVisible({ timeout: 5000 });
    await expect(full).toHaveAttribute('data-tip-card', 'league-complete');
    await expect(full).toContainText('League ready');
    await expect(full.getByRole('button', { name: 'Export league' })).toBeVisible();
    await full.getByRole('button', { name: 'Dismiss' }).click();
    await expectNoFollowUpNudge(page);
    await expect.poll(() => nudgeEvents(events).map((e) => e.event)).toEqual([
      'league-nudge-league-shown',
      'league-nudge-league-dismiss',
      'league-nudge-league-dismiss',
    ]);
    await attachRosterState(page, testInfo, events);
  });

  test('when the eighth gym is the last empty card, only League ready shows', async ({ page }, testInfo) => {
    const events = await collectEvents(page);
    await filledSlotsLeague(page, [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13]);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await seatLine(page, 7, 'pikachu');
    const full = tip(page);
    await expect(full).toBeVisible({ timeout: 5000 });
    await expect(full).toHaveAttribute('data-tip-card', 'league-complete');
    await expect(full).toContainText('League ready');
    await full.getByRole('button', { name: 'Dismiss' }).click();
    await expectNoFollowUpNudge(page);
    await expect.poll(() => nudgeEvents(events).map((e) => e.event)).toEqual([
      'league-nudge-league-shown',
      'league-nudge-league-dismiss',
    ]);
    await attachRosterState(page, testInfo, events);
  });

  test('does not post nudge beacons under ?notme', async ({ page }) => {
    const events = await collectEvents(page);
    await fiveLineCardLeague(page);
    await page.goto('/custom-gym-leader?notme');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await seatSixthLine(page);
    await expect(tip(page)).toBeVisible({ timeout: 5000 });
    expect(nudgeEvents(events)).toEqual([]);
  });
});

async function unseenEightGymsLeague(page: Page) {
  await page.addInitScript(() => {
    const empty = () => ({ type: null, theme: '', lines: [] as unknown[], signatureSeat: null, tmMoveId: null, badgeName: '', legend: null, powerup: null });
    const cards = Array.from({ length: 14 }, (_, i) =>
      i < 8 ? { ...empty(), lines: [{ branch: [i + 1], boundaries: [1], boundaryMode: 'auto' }] } : empty());
    window.localStorage.setItem('league-builder', JSON.stringify({ state: { name: '', cards, celebratedNudges: [] }, version: 3 }));
  });
}

test.describe('league funnel export nudges on a Retina desktop', () => {
  test.use({ viewport: { width: 1440, height: 790 }, deviceScaleFactor: 2 });

  test('the gym-leaders popup floats under Export and leaves the summary alone', async ({ page }, testInfo) => {
    await collectEvents(page);
    await unseenEightGymsLeague(page);
    await page.goto('/custom-gym-leader');
    const nudge = tip(page);
    await expect(nudge).toHaveAttribute('data-tip-card', 'league-gyms', { timeout: 5000 });
    await expect(page.locator('[data-league-export="league"] [data-tip-dot]')).toBeVisible();
    await page.waitForTimeout(500);
    const read = () => page.evaluate(() => {
      const root = document.querySelector('[data-lg-league-root]')!;
      const s = root.getBoundingClientRect();
      const n = document.querySelector('[data-testid="tip-card"]')?.getBoundingClientRect();
      const exportBox = document.querySelector('[data-league-export="league"]')!.getBoundingClientRect();
      const arrow = document.querySelector('[data-testid="tip-card"] .rotate-45')?.getBoundingClientRect();
      return {
        zoom: Number(getComputedStyle(root.parentElement!).zoom),
        summary: { left: s.left, right: s.right, top: s.top },
        popup: n ? { left: n.left, right: n.right, top: n.top } : null,
        arrowToExport: arrow ? Math.abs(arrow.left + arrow.width / 2 - (exportBox.left + exportBox.width / 2)) : null,
        viewportWidth: innerWidth,
      };
    });
    const open = await read();
    await nudge.getByRole('button', { name: 'Dismiss' }).click();
    await expect(nudge).toHaveCount(0);
    await page.waitForTimeout(500);
    const closed = await read();
    await testInfo.attach('roster-popup-beside.json', { body: JSON.stringify({ open, closed }, null, 2), contentType: 'application/json' });
    expect(open.popup!.right).toBeLessThanOrEqual(open.viewportWidth);
    expect(open.summary, 'the summary does not move while the popup shows').toEqual(closed.summary);
    expect(open.arrowToExport).toBeLessThan(24);
    expect(open.zoom, 'the summary keeps its zoom while the popup shows').toBe(closed.zoom);
  });
});
