import { expect, test, type Page } from '@playwright/test';
import { seededLeague } from './support/leagueSeed';

/**
 * The signature picker's "Current Team" chip.
 *
 * Two rules meet here. Scoping to the team and filtering by the gym's type
 * ask the same question — every line on a Rock gym is Rock — so the scope
 * puts the type filter aside, and gives it back when it lets go. And once the
 * template is full the scope is not a choice at all, because there is no
 * seventh seat for a line from outside it; the chip stays on, wears a lock,
 * and says why when pressed.
 */

const openSignature = async (page: Page, slot: number) => {
  await seededLeague(page);
  await page.goto('/pokemon-league-builder');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.waitForTimeout(400);
  await page.click(`[data-testid="league-slot-${slot}"]`);
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(700);
};

const openPane = async (page: Page) => {
  await page.evaluate(() => {
    const slot = [...document.querySelectorAll('button')].find((b) =>
      /SIGNATURE POK/.test(b.textContent ?? ''),
    );
    (slot as HTMLButtonElement).click();
  });
  await page.waitForTimeout(1200);
};

/** Which type chips the pane is showing, by their own label. */
const typeChips = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('span.rounded-full')]
      .map((chip) => (chip.textContent ?? '').trim())
      .filter((text) => /^(Rock|Water|Grass|Fire|Electric|Dragon|Psychic|Poison|Ground|Flying|Ice|Bug|Fighting|Ghost|Steel|Dark|Fairy|Normal)$/.test(text)),
  );

const tiles = (page: Page) => page.locator('[data-testid="verify-evo-card"]').count();

test.describe('the team scope chip', () => {
  test('a full card locks it on, and says why when pressed', async ({ page }) => {
    await openSignature(page, 0); // Brock: six lines, so the template is full
    await openPane(page);

    const locked = page.locator('[data-filter-chip="scope-locked"]');
    expect(await locked.count(), 'the chip is there and locked').toBe(1);
    await expect(locked).toHaveText(/Current Team/);
    expect(await page.locator('[data-filter-chip="scope"]').count(), 'not the off state').toBe(0);
    expect(await typeChips(page), 'and the type filter stands down').toEqual([]);

    expect(await page.locator('[data-scope-lock-hint]').count(), 'no hint until asked').toBe(0);
    await locked.click();
    await expect(page.locator('[data-scope-lock-hint]')).toHaveText('Choose a pokemon from your team');
    // It is a hint, not a dialog: it goes on its own.
    await expect(page.locator('[data-scope-lock-hint]')).toHaveCount(0, { timeout: 6000 });
  });

  test('turning it on parks the type filter, and turning it off gives it back', async ({ page }) => {
    await openSignature(page, 0);
    // One line out, so the template has room and the chip is the user's.
    await page.evaluate(() => {
      (document.querySelector('button[aria-label^="Remove"]') as HTMLButtonElement).click();
    });
    await page.waitForTimeout(500);
    await openPane(page);

    expect(await typeChips(page), "the gym's own type arrives selected").toEqual(['Rock']);
    const unscoped = await tiles(page);

    await page.click('[data-filter-chip="scope"]');
    await page.waitForTimeout(600);
    expect(await typeChips(page), 'the scope displaces it').toEqual([]);
    const scoped = await tiles(page);
    expect(scoped, 'and narrows the grid to the team').toBeLessThan(unscoped);

    // Dismiss the chip the way the chip offers.
    await page.evaluate(() => {
      const chip = [...document.querySelectorAll('span')].find(
        (s) => /Current Team/.test(s.textContent ?? '') && s.className.includes('rounded-full'),
      )!;
      (chip.querySelectorAll('button')[1] as HTMLButtonElement).click();
    });
    await page.waitForTimeout(600);
    expect(await typeChips(page), 'and hands it back').toEqual(['Rock']);
    expect(await tiles(page), 'with the grid it had').toBe(unscoped);
  });
});
