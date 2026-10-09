import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

type Cell = { kind: string; ids?: number[]; sources?: string[] };
const CELLS = JSON.parse(readFileSync('api/_favoriteCells.json', 'utf8')) as Record<string, Cell>;
const LAST = 'normal|1';
const TITLE = 'Grid complete';

/** Every eligible cell filled, leaving out `LAST` when asked. Pointers never point at `LAST`. */
function board(leaveOutLast: boolean): Record<string, number> {
  const fills: Record<string, number> = {};
  for (const [key, cell] of Object.entries(CELLS)) if (cell.kind === 'pick' && cell.ids?.length) fills[key] = cell.ids[0];
  for (const [key, cell] of Object.entries(CELLS)) {
    if (cell.kind !== 'pointer') continue;
    const source = cell.sources?.find((s) => s !== LAST && fills[s] != null);
    if (source) fills[key] = fills[source];
  }
  if (leaveOutLast) delete fills[LAST];
  return fills;
}

/** Seeds the saved board once per tab, so a reload keeps what the page saved. */
async function open(page: Page, fills: Record<string, number>) {
  const beacons: Record<string, unknown>[] = [];
  await page.route('**/api/favorites', async (route) => { beacons.push(route.request().postDataJSON()); await route.fulfill({ json: { ok: true } }); });
  await page.addInitScript((saved) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('favorite-picker', JSON.stringify({ state: { fills: saved }, version: 3 }));
    sessionStorage.setItem('seeded', '1');
  }, fills);
  await page.goto('/favorite-pokemon-picker?lang=en');
  return beacons;
}

/** Opens the last cell and picks its first Pokémon. Returns that Pokémon's id. */
async function pickLast(page: Page) {
  await page.getByTestId('favorites-cell-normal-1').click();
  const first = page.locator('[data-testid^="favorites-pick-"]').first();
  const id = Number((await first.getAttribute('data-testid'))!.replace('favorites-pick-', ''));
  await first.click();
  return id;
}

/** Opens the last cell and picks its current Pokémon again, which clears it. */
async function clearLast(page: Page, id: number) {
  await page.getByTestId('favorites-cell-normal-1').click();
  await page.getByTestId(`favorites-pick-${id}`).click();
}

const popup = (page: Page) => page.getByRole('status').filter({ hasText: TITLE });
const nudges = (beacons: Record<string, unknown>[]) => beacons.filter((b) => b.kind === 'nudge-shown');

test.describe('Picker completion popup @viewport', () => {
  test('completing the grid points a popup at Export once, and its beacon carries the full board', async ({ page }, testInfo) => {
    const beacons = await open(page, board(true));
    await expect(page.getByTestId('favorites-completion')).toHaveText('256/257');
    const picked = await pickLast(page);
    await expect(page.getByTestId('favorites-completion')).toHaveText('257/257');
    await expect(popup(page)).toBeVisible();
    await popup(page).evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
    const geometry = await page.evaluate((title) => {
      const button = document.querySelector('[data-testid="favorites-export-open"]')!.getBoundingClientRect();
      const card = [...document.querySelectorAll('[role="status"]')].find((el) => el.textContent?.includes(title))!;
      const box = card.getBoundingClientRect();
      const arrow = card.querySelector('.rotate-45')!.getBoundingClientRect();
      return {
        viewport: innerWidth,
        arrowOffset: Math.round((arrow.left + arrow.width / 2 - (button.left + button.width / 2)) * 100) / 100,
        gapBelowButton: Math.round(box.top - button.bottom),
        left: Math.round(box.left),
        right: Math.round(box.right),
      };
    }, TITLE);
    expect(Math.abs(geometry.arrowOffset)).toBeLessThanOrEqual(1);
    expect(geometry.gapBelowButton).toBe(10);
    expect(geometry.left).toBeGreaterThanOrEqual(8);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport - 8);
    await expect.poll(() => nudges(beacons).length).toBe(1);
    const [shown] = nudges(beacons);
    expect(Object.keys((shown.snapshot as { fills: object }).fills)).toHaveLength(257);
    await testInfo.attach('complete-popup.png', { body: await page.screenshot(), contentType: 'image/png' });

    // Opening Export is what the popup asks for, so the popup goes.
    await page.getByTestId('favorites-export-open').click();
    await expect(popup(page)).toHaveCount(0);
    await expect.poll(() => beacons.filter((b) => b.kind === 'export-shown').length).toBe(1);
    await page.locator('[data-export-scrim] button').click({ position: { x: 4, y: 4 } });
    await expect(page.locator('[data-export-scrim]')).toHaveCount(0);

    // Clearing a cell and filling it again, or a reload, does not replay it.
    await clearLast(page, picked);
    await expect(page.getByTestId('favorites-completion')).toHaveText('256/257');
    await pickLast(page);
    await expect(page.getByTestId('favorites-completion')).toHaveText('257/257');
    await page.waitForTimeout(800);
    await expect(popup(page)).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('favorites-completion')).toHaveText('257/257');
    await page.waitForTimeout(800);
    await expect(popup(page)).toHaveCount(0);
    expect(nudges(beacons)).toHaveLength(1);
    await testInfo.attach('complete-popup.json', {
      body: JSON.stringify({ geometry, nudgeBeacons: nudges(beacons).length, nudgeCells: 257 }, null, 2),
      contentType: 'application/json',
    });
  });
});

test('a grid that is already complete when the page opens never shows the popup', async ({ page }, testInfo) => {
  const beacons = await open(page, board(false));
  await expect(page.getByTestId('favorites-completion')).toHaveText('257/257');
  await clearLast(page, CELLS[LAST].ids![0]);
  await expect(page.getByTestId('favorites-completion')).toHaveText('256/257');
  await pickLast(page);
  await expect(page.getByTestId('favorites-completion')).toHaveText('257/257');
  await page.waitForTimeout(800);
  await expect(popup(page)).toHaveCount(0);
  expect(nudges(beacons)).toHaveLength(0);
  await testInfo.attach('already-complete.json', { body: JSON.stringify({ popups: 0, nudgeBeacons: 0 }), contentType: 'application/json' });
});
