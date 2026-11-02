import { test, expect, type Page } from '@playwright/test';
import { FAVORITE_CELLS, LAST_CELL, clearLastCell, favoritesBoard, pickLastCell, seedFavorites } from './support/favoritesBoard';

const TITLE = 'Grid complete';

async function open(page: Page, fills: Record<string, number>) {
  const beacons: Record<string, unknown>[] = [];
  await page.route('**/api/favorites', async (route) => { beacons.push(route.request().postDataJSON()); await route.fulfill({ json: { ok: true } }); });
  await seedFavorites(page, fills);
  await page.goto('/favorite-pokemon-picker?lang=en');
  return beacons;
}

const popup = (page: Page) => page.getByRole('status').filter({ hasText: TITLE });
const nudges = (beacons: Record<string, unknown>[]) => beacons.filter((b) => b.kind === 'nudge-shown');

test.describe('Picker completion popup @viewport', () => {
  test('completing the grid points a popup at Export once, and its beacon carries the full board', async ({ page }, testInfo) => {
    const beacons = await open(page, favoritesBoard(true));
    await expect(page.getByTestId('favorites-completion')).toHaveText('256/257');
    const picked = await pickLastCell(page);
    await expect(page.getByTestId('favorites-completion')).toHaveText('257/257');
    await expect(popup(page)).toBeVisible();
    await popup(page).evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
    const geometry = await page.evaluate((title) => {
      const button = document.querySelector('[data-testid="favorites-export-open"]')!.getBoundingClientRect();
      const card = [...document.querySelectorAll('[role="status"]')].find((el) => el.textContent?.includes(title))!;
      const box = card.getBoundingClientRect();
      const arrow = card.querySelector('.rotate-45')!.getBoundingClientRect();
      const dotOnExport = document.querySelector('[data-testid="favorites-export-open"] [data-tip-dot]') !== null;
      return {
        viewport: innerWidth,
        arrowOffset: Math.round((arrow.left + arrow.width / 2 - (button.left + button.width / 2)) * 100) / 100,
        gapBelowButton: Math.round(box.top - button.bottom),
        dotOnExport,
        left: Math.round(box.left),
        right: Math.round(box.right),
      };
    }, TITLE);
    expect(Math.abs(geometry.arrowOffset)).toBeLessThanOrEqual(1);
    expect(geometry.gapBelowButton).toBe(10);
    expect(geometry.dotOnExport).toBe(true);
    expect(geometry.left).toBeGreaterThanOrEqual(8);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport - 8);
    await expect.poll(() => nudges(beacons).length).toBe(1);
    const [shown] = nudges(beacons);
    expect(Object.keys((shown.snapshot as { fills: object }).fills)).toHaveLength(257);
    await testInfo.attach('complete-popup.png', { body: await page.screenshot(), contentType: 'image/png' });

    await page.getByTestId('favorites-export-open').click();
    await expect(popup(page)).toHaveCount(0);
    await expect.poll(() => beacons.filter((b) => b.kind === 'export-shown').length).toBe(1);
    await page.locator('[data-export-scrim] button').click({ position: { x: 4, y: 4 } });
    await expect(page.locator('[data-export-scrim]')).toHaveCount(0);

    await clearLastCell(page, picked);
    await expect(page.getByTestId('favorites-completion')).toHaveText('256/257');
    await pickLastCell(page);
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
  const beacons = await open(page, favoritesBoard(false));
  await expect(page.getByTestId('favorites-completion')).toHaveText('257/257');
  await clearLastCell(page, FAVORITE_CELLS[LAST_CELL].ids![0]);
  await expect(page.getByTestId('favorites-completion')).toHaveText('256/257');
  await pickLastCell(page);
  await expect(page.getByTestId('favorites-completion')).toHaveText('257/257');
  await page.waitForTimeout(800);
  await expect(popup(page)).toHaveCount(0);
  expect(nudges(beacons)).toHaveLength(0);
  await testInfo.attach('already-complete.json', { body: JSON.stringify({ popups: 0, nudgeBeacons: 0 }), contentType: 'application/json' });
});
