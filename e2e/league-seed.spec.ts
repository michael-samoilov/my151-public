import { expect, test } from '@playwright/test';
import { seededLeague } from './support/leagueSeed';

/**
 * The Kanto league a preview build seeds on a first visit.
 *
 * The seed exists for feature work, so what it must guarantee is that there
 * is something to work against: twelve full teams, one of every card feature
 * that is hard to reach by hand, and two rows left blank so the empty state
 * is on screen beside the filled one.
 */

test.describe('seeded league', () => {
  test.beforeEach(async ({ page }) => {
    await seededLeague(page);
    await page.goto('/pokemon-league-builder');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.waitForTimeout(400);
  });

  test('opens on a named league with twelve slots filled and two blank', async ({ page }) => {
    await expect(page.locator('input[aria-label="League name"]')).toHaveValue('Kanto League');

    const filled = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="league-slot-"]')].map(
        (row) =>
          [...row.querySelectorAll('img')].filter((img) =>
            (img.getAttribute('src') ?? '').includes('/sprites/pokemon/'),
          ).length,
      ),
    );
    // What a filled summary shows is the row's own team size: two at gym 1,
    // rising to six for the champion and the boss. Gym 7 and Elite Four 2 are
    // the two blanks, and a blank row paints no sprite at all.
    expect(filled).toEqual([2, 3, 3, 3, 4, 4, 0, 5, 5, 0, 5, 5, 6, 6]);

    // A blank row offers to start the card; a filled one offers to open it.
    const actions = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="league-action-"]')].map(
        (el) => el.getAttribute('data-action'),
      ));
    expect(actions.filter((a) => a === 'add'), 'two rows say add').toHaveLength(2);
    expect(actions[6]).toBe('add');
    expect(actions[9]).toBe('add');
  });

  test('every seeded card holds a full six lines', async ({ page }) => {
    const lines = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('league-builder')!).state.cards.map(
        (c: { lines: unknown[] }) => c.lines.length,
      ),
    );
    const expected = Array(14).fill(6);
    expected[6] = 0;
    expected[9] = 0;
    expect(lines, 'twelve full teams, two blank rows').toEqual(expected);
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

  test('a leader who fields a mid-line stage gets there by a drag', async ({ page }) => {
    // Brock's team is Onix, and the line a picker hands over is Onix into
    // Steelix. The seed reaches his state the way a person would — one
    // boundary push — so the line reads as edited, reset button and all.
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(400);
    const alt = (row: number) =>
      page.evaluate(
        (r) => document.querySelector(`[data-testid="card-cell-${r}-1"] img`)?.getAttribute('alt') ?? null,
        row,
      );
    expect(await alt(1), 'Onix from the top row').toBe('onix');
    expect(await alt(11), 'and still Onix at the bottom — Steelix is pushed off').toBe('onix');
    await expect(
      page.locator('[aria-label="Reset onix\'s evolution rows"]'),
      'an edited line offers its reset',
    ).toHaveCount(1);
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
