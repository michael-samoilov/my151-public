import { expect, test } from '@playwright/test';
import { seededLeague } from './support/leagueSeed';

/**
 * The Kanto league a preview build seeds on a first visit.
 *
 * The seed exists for feature work, so what it must guarantee is that there
 * is something to work against: fourteen full teams, and one of every card
 * feature that is hard to reach by hand.
 */

test.describe('seeded league', () => {
  test.beforeEach(async ({ page }) => {
    await seededLeague(page);
    await page.goto('/pokemon-league-builder');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.waitForTimeout(400);
  });

  test('opens on a named league with every slot filled', async ({ page }) => {
    await expect(page.locator('input[aria-label="League name"]')).toHaveValue('Kanto League');

    const filled = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="league-slot-"]')].map(
        (row) =>
          [...row.querySelectorAll('img')].filter((img) =>
            (img.getAttribute('src') ?? '').includes('/sprites/pokemon/'),
          ).length,
      ),
    );
    // Every slot is filled and every card holds six lines. What the summary
    // shows is the row's own team size, which is what these counts are: two
    // at gym 1, rising to six for the champion and the boss.
    expect(filled).toEqual([2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6]);
  });

  test('every card holds a full six lines', async ({ page }) => {
    const lines = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('league-builder')!).state.cards.map(
        (c: { lines: unknown[] }) => c.lines.length,
      ),
    );
    expect(lines, 'fourteen full teams').toEqual(Array(14).fill(6));
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
    expect(await summary(12)).toContain('Mega Salamence');
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
    // Seat 6 holds Lapras; Mewtwo covers it on the endgame boss row.
    expect(await alt(10, 6)).toBe('lapras');
    expect(await alt(11, 6)).toBe('mewtwo');
  });
});
