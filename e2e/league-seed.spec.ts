import { expect, test } from '@playwright/test';
import { seededLeague } from './support/leagueSeed';

/**
 * The Kanto league a preview build seeds on a first visit.
 *
 * The seed exists for feature work, so what it must guarantee is that there
 * is something to work against: filled slots, empty slots, and one of every
 * card feature that is hard to reach by hand.
 */

test.describe('seeded league', () => {
  test.beforeEach(async ({ page }) => {
    await seededLeague(page);
    await page.goto('/pokemon-league-builder');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.waitForTimeout(400);
  });

  test('opens on a named league with both filled and empty slots', async ({ page }) => {
    await expect(page.locator('input[aria-label="League name"]')).toHaveValue('Kanto League');

    const filled = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="league-slot-"]')].map(
        (row) =>
          [...row.querySelectorAll('img')].filter((img) =>
            (img.getAttribute('src') ?? '').includes('/sprites/pokemon/'),
          ).length,
      ),
    );
    // Six gyms, three Elite Four, a champion and an endgame boss. Gyms 7 and
    // 8 and the fourth Elite Four member stay empty on purpose.
    expect(filled).toEqual([2, 3, 3, 3, 4, 4, 0, 0, 5, 5, 5, 0, 6, 6]);
  });

  test('the champion carries a Mega and the boss a Gigantamax', async ({ page }) => {
    const summary = (slot: number) =>
      page.evaluate(
        (s) =>
          [...document.querySelectorAll(`[data-testid="league-slot-${s}"] img`)]
            .map((img) => img.getAttribute('alt'))
            .filter((alt): alt is string => !!alt),
        slot,
      );
    expect(await summary(12)).toContain('Mega Charizard X');
    expect(await summary(13)).toContain('Gigantamax Charizard');
  });

  test('the boss legendary covers its seat on the boss row only', async ({ page }) => {
    await page.click('[data-testid="league-slot-13"]');
    await page.waitForSelector('[data-testid="card-cell-11-1"]');
    await page.waitForTimeout(400);
    const alt = (row: number, seat: number) =>
      page.evaluate(
        ([r, s]) =>
          document
            .querySelector(`[data-testid="card-cell-${r}-${s}"] img`)
            ?.getAttribute('alt') ?? null,
        [row, seat],
      );
    // Seat 6 holds Espeon; Mewtwo covers it on the endgame boss row.
    expect(await alt(10, 6)).toBe('espeon');
    expect(await alt(11, 6)).toBe('mewtwo');
  });
});
