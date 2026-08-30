import { expect, test, type Page } from '@playwright/test';
import { seededLeague } from './support/leagueSeed';

/**
 * Four behaviours the preview asked for, each driven end to end.
 *
 * They share the seeded league because each one needs a card that already
 * holds six lines, a powerup and a legendary — building that by hand in every
 * test would be most of the test.
 */

const openCard = async (page: Page, slot: number) => {
  await seededLeague(page);
  await page.goto('/pokemon-league-builder');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.waitForTimeout(400);
  await page.click(`[data-testid="league-slot-${slot}"]`);
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(900);
};

/** The store, as it is actually persisted. */
const stored = (page: Page, slot: number) =>
  page.evaluate(
    (i) => JSON.parse(window.localStorage.getItem('league-builder')!).state.cards[i],
    slot,
  );

test.describe('round 10', () => {
  test('a Pokémon name follows the language', async ({ page }) => {
    await openCard(page, 0);
    const signature = () =>
      page.evaluate(() => {
        const slot = [...document.querySelectorAll('button')].find((b) =>
          /SIGNATURE POK/.test(b.textContent ?? ''),
        );
        return (slot?.textContent ?? '').replace('SIGNATURE POKÉMON', '');
      });
    expect(await signature()).toContain('Onix');

    await page.locator('header button[aria-haspopup="menu"]').click();
    await page.waitForTimeout(400);
    await page.locator('[role="menuitemradio"]:visible', { hasText: '日本語' }).first().click();
    await page.waitForTimeout(2500);

    // The types under the sprite always switched; the name above them did
    // not, because the snapshot behind `useNamesVersion` ignored the locale.
    const after = await signature();
    expect(after, 'the name is translated').toContain('イワーク');
    expect(after, 'and so are the types').toContain('いわ');
  });

  test('a powerup travels with its line, not its seat', async ({ page }) => {
    await openCard(page, 12);
    const before = await stored(page, 12);
    const seat = before.powerup.seat as number;
    const line = before.lines[seat - 1].branch as number[];
    expect(seat, 'the seeded champion carries a Mega').toBeGreaterThan(0);

    // Drag that column to the far end of the row.
    const from = (await page.locator(`[data-testid="card-cell-10-${seat}"]`).boundingBox())!;
    const to = (await page.locator('[data-testid="card-cell-10-6"]').boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(350);
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await page.waitForTimeout(300);
    await page.mouse.up();
    await page.waitForTimeout(700);

    const after = await stored(page, 12);
    expect(after.powerup, 'the powerup is still on the card').not.toBeNull();
    expect(
      after.lines[after.powerup.seat - 1].branch,
      'and still on the line it was pressed for',
    ).toEqual(line);
  });

  test('the legendary can be removed without touching the lines', async ({ page }) => {
    await openCard(page, 13);
    const before = await stored(page, 13);
    expect(before.legend, 'the seeded boss has one').not.toBeNull();

    const control = page.locator('button[aria-label="Remove the endgame boss legendary"]');
    expect(await control.count(), 'the legendary carries its own X').toBe(1);
    await control.click();
    await page.waitForTimeout(600);

    const after = await stored(page, 13);
    expect(after.legend, 'the legendary is gone').toBeNull();
    expect(after.lines.length, 'every line stayed').toBe(before.lines.length);
    expect(after.lines, 'and none of them changed').toEqual(before.lines);
  });

  test('the settings gear switches the league summary to rematches', async ({ page }) => {
    await seededLeague(page);
    await page.goto('/pokemon-league-builder');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.waitForTimeout(700);

    /** How many Pokémon a row draws. Type icons carry no alt text. */
    const team = (slot: number) =>
      page.evaluate(
        (i) =>
          [...document.querySelectorAll(`[data-testid="league-slot-${i}"] img`)].filter((img) =>
            (img.getAttribute('src') ?? '').includes('/sprites/pokemon/'),
          ).length,
        slot,
      );
    const gym1 = await team(0);
    expect(gym1, 'gym 1 fields a small team on the way through').toBeLessThan(6);

    await page.locator('[data-testid="league-settings"]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-league-view="rematch"]:visible').click();
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    expect(await team(0), 'the rematch fields the whole card').toBeGreaterThan(gym1);
    expect(
      await page.evaluate(() => JSON.parse(window.localStorage.getItem('league-builder')!).state.view),
      'and the choice is remembered',
    ).toBe('rematch');
  });
});
