import { expect, test, type Page } from '@playwright/test';
import { fiveLineCardLeague, sevenGymsLeague } from './support/leagueSeed';

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

function nudgeEvents(events: EventBody[]) {
  return events.filter((e) => typeof e.event === 'string' && e.event.startsWith('league-nudge-'));
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

  test('eight filled gym-leader slots suggest exporting the league', async ({ page }) => {
    const events = await collectEvents(page);
    await sevenGymsLeague(page);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-7"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(400);
    await page.click('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input')];
      const el = inputs[inputs.length - 1];
      const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setValue.call(el, 'pikachu');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(700);
    await page.click('[data-testid="verify-evo-card"]');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /Back to the league/ }).click();
    await page.waitForSelector('[data-testid="league-slot-0"]');
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
    await expect(nudge).toContainText('League ready');
    await expect(nudge).not.toContainText(/gym leaders?/i);
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
