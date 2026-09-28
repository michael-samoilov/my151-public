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

/** Open a league slot, seat one line on its first cell, and return home. */
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

/** Wait out the reveal delay, then prove no popup took the dismissed one's place. */
async function expectNoFollowUpNudge(page: Page) {
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('league-nudge')).toHaveCount(0);
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
    const nudge = page.getByTestId('league-nudge');
    await expect(nudge).toBeVisible({ timeout: 5000 });
    await expect(nudge).toHaveAttribute('data-league-nudge', 'card');
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
    await expect(page.getByTestId('league-nudge')).toHaveCount(0);
  });

  test('eight gym leaders with a card still empty suggest exporting now or later', async ({ page }, testInfo) => {
    const events = await collectEvents(page);
    await sevenGymsLeague(page);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await seatLine(page, 7, 'pikachu');
    const nudge = page.getByTestId('league-nudge');
    await expect(nudge).toBeVisible({ timeout: 5000 });
    await expect(nudge).toHaveAttribute('data-league-nudge', 'league');
    const geo = await page.evaluate(() => {
      const mid = (el: Element | null) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return r.left + r.width / 2;
      };
      return {
        exportX: mid(document.querySelector('[data-league-export="league"]')),
        nameX: mid(document.querySelector('[aria-label="League name"]')),
        arrowX: mid(document.querySelector('[data-nudge-arrow]')),
      };
    });
    expect(geo.exportX).toBeGreaterThan(0);
    expect(geo.nameX).toBeGreaterThan(0);
    expect(geo.arrowX).toBeGreaterThan(0);
    expect(geo.exportX!).toBeGreaterThan(page.viewportSize()!.width * 0.7);
    expect(Math.abs(geo.arrowX! - geo.exportX!)).toBeLessThan(Math.abs(geo.arrowX! - geo.nameX!));
    expect(Math.abs(geo.arrowX! - geo.exportX!)).toBeLessThan(24);
    await expect(nudge).toContainText('Gym leaders complete');
    await expect(nudge).toContainText('Export now, or keep building and export when it is complete.');
    await expect(nudge).not.toContainText(/toolbar/i);
    await expect(nudge.getByRole('button', { name: 'Export league' })).toBeVisible();
    await expect.poll(() => nudgeEvents(events).map((e) => e.event)).toEqual([
      'league-nudge-league-shown',
    ]);
    await nudge.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByTestId('league-nudge')).toHaveCount(0);
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
    const gyms = page.getByTestId('league-nudge');
    await expect(gyms).toHaveAttribute('data-league-nudge', 'league', { timeout: 5000 });
    await gyms.getByRole('button', { name: 'Dismiss' }).click();
    await seatLine(page, 8, 'eevee');
    const full = page.getByTestId('league-nudge');
    await expect(full).toBeVisible({ timeout: 5000 });
    await expect(full).toHaveAttribute('data-league-nudge', 'complete');
    await expect(full).toContainText('League ready');
    await expect(full).toContainText('Export the league as an image and share it.');
    await expect(full.getByRole('button', { name: 'Export league' })).toBeVisible();
    await full.getByRole('button', { name: 'Dismiss' }).click();
    await expectNoFollowUpNudge(page);
    // /api/event accepts no name of its own for this popup, and `shown`
    // posts once per browser, so the second popup adds only its dismiss.
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
    const full = page.getByTestId('league-nudge');
    await expect(full).toBeVisible({ timeout: 5000 });
    await expect(full).toHaveAttribute('data-league-nudge', 'complete');
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
    await expect(page.getByTestId('league-nudge')).toBeVisible({ timeout: 5000 });
    expect(nudgeEvents(events)).toEqual([]);
  });
});
