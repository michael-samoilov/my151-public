import { expect, test, type Page } from '@playwright/test';
import { seededLeague } from './support/leagueSeed';

/**
 * Starting one card over.
 *
 * The control copies the dex builder's build-page gear (`SettingsMenu` in
 * `PokedexGrid.tsx`): one destructive row, whose first press turns it into
 * "Are you sure?" and whose second does the work. So the spec drives the
 * affordance as well as the outcome — a confirm that does not arm, or one
 * that never lapses, is the same defect as a clear that does not clear.
 */

const openCard = async (page: Page, slot: number) => {
  await seededLeague(page);
  await page.goto('/pokemon-league-builder');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.waitForTimeout(400);
  await page.click(`[data-testid="league-slot-${slot}"]`);
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(800);
};

const stored = (page: Page, slot: number) =>
  page.evaluate(
    (i) => JSON.parse(window.localStorage.getItem('league-builder')!).state.cards[i],
    slot,
  );

test.describe('clear a card', () => {
  test('two presses clear it, and only it', async ({ page }) => {
    await openCard(page, 0);
    const before = await stored(page, 0);
    const neighbour = await stored(page, 1);
    expect(before.lines.length, 'the seeded card is full').toBe(6);

    await page.click('[data-testid="card-settings"]');
    await page.waitForTimeout(300);
    const row = page.locator('[data-testid="card-clear"]');
    await expect(row).toHaveText(/Clear Card/);

    // First press arms; nothing has happened yet.
    await row.click();
    await page.waitForTimeout(200);
    await expect(row).toHaveText(/Are you sure\?/);
    expect((await stored(page, 0)).lines.length, 'still armed, not fired').toBe(6);

    await row.click();
    await page.waitForTimeout(500);

    const after = await stored(page, 0);
    expect(after.lines, 'every line went').toEqual([]);
    expect(after.type, 'and the type').toBeNull();
    expect(after.theme, 'and the theme').toBe('');
    expect(after.badgeName, 'and the badge').toBe('');
    expect(after.tmMoveId, 'and the TM').toBeNull();
    expect(after.signatureSeat, 'and the signature').toBeNull();
    expect(await stored(page, 1), 'the next card is untouched').toEqual(neighbour);
    expect(await page.locator('[data-testid="card-clear"]').count(), 'the menu closes').toBe(0);
  });

  test('an armed confirm lapses on its own', async ({ page }) => {
    await openCard(page, 2);
    await page.click('[data-testid="card-settings"]');
    await page.waitForTimeout(300);
    const row = page.locator('[data-testid="card-clear"]');
    await row.click();
    await expect(row).toHaveAttribute('data-confirming', 'true');
    // The dex builder disarms after three seconds; a menu left open never
    // sits one press away from wiping a card.
    await expect(row).toHaveAttribute('data-confirming', 'false', { timeout: 6000 });
    expect((await stored(page, 2)).lines.length, 'nothing was cleared').toBe(6);
  });

  test('a press outside closes the menu and disarms it', async ({ page }) => {
    await openCard(page, 3);
    await page.click('[data-testid="card-settings"]');
    await page.waitForTimeout(300);
    await page.locator('[data-testid="card-clear"]').click();
    await expect(page.locator('[data-testid="card-clear"]')).toHaveAttribute('data-confirming', 'true');

    await page.mouse.click(8, 8);
    await page.waitForTimeout(300);
    expect(await page.locator('[data-testid="card-clear"]').count(), 'the menu closed').toBe(0);

    await page.click('[data-testid="card-settings"]');
    await page.waitForTimeout(300);
    await expect(
      page.locator('[data-testid="card-clear"]'),
      'and it reopens unarmed',
    ).toHaveAttribute('data-confirming', 'false');
    expect((await stored(page, 3)).lines.length).toBe(6);
  });
});
