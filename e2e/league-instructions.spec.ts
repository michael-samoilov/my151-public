import { expect, test, type Page } from '@playwright/test';
import { blankLeague } from './support/leagueSeed';

/**
 * The trainer card's instructions.
 *
 * The card's gestures (a drag up or down, a hold and drag sideways, a tap on
 * the boss row) show nothing until you try them, so the card's own bar carries
 * an info button that names them. It has to sit beside the card's export, in
 * the same bar, and the popup has to close the ways a person expects.
 */

async function openCard(page: Page) {
  await blankLeague(page);
  await page.goto('/custom-gym-leader');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.click('[data-testid="league-slot-0"]');
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  // Mobile pans the card in; measure once it has arrived.
  await page.waitForTimeout(500);
}

test.describe('trainer card instructions', () => {
  test('the info button sits immediately left of the card export', async ({ page }) => {
    await openCard(page);
    const info = page.getByRole('button', { name: 'How to edit this card' });
    await expect(info).toBeVisible();

    const layout = await page.evaluate(() => {
      const i = document.querySelector('[data-league-help="card"]')!;
      const e = document.querySelector('[data-league-export="card"]')!;
      const ir = i.getBoundingClientRect();
      const er = e.getBoundingClientRect();
      return {
        sameBar: i.closest('[data-testid="league-tool-bar"]') === e.closest('[data-testid="league-tool-bar"]'),
        gap: er.left - ir.right,
        middles: Math.abs(er.top + er.height / 2 - (ir.top + ir.height / 2)),
        rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
      };
    });
    expect(layout.sameBar, 'info and export share the card bar').toBe(true);
    // Left of export with nothing between: the bar's own control gap, no more.
    expect(layout.gap).toBeGreaterThanOrEqual(0);
    expect(layout.gap).toBeLessThanOrEqual(0.5 * layout.rootPx);
    expect(layout.middles, 'the two buttons share a centre line').toBeLessThan(1);
  });

  test('it opens a dialog naming the three gestures, and Esc closes it', async ({ page }) => {
    await openCard(page);
    const info = page.getByRole('button', { name: 'How to edit this card' });
    await info.click();

    const dialog = page.getByRole('dialog', { name: 'How to edit this card' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Change when it evolves' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Reorder your team' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Add an Endgame legendary' })).toBeVisible();

    const box = (await dialog.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 0.5);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    // Focus goes back to the button that opened it.
    await expect(info).toBeFocused();
  });

  test('a press outside the popup closes it', async ({ page }) => {
    await openCard(page);
    await page.getByRole('button', { name: 'How to edit this card' }).click();
    const dialog = page.getByRole('dialog', { name: 'How to edit this card' });
    await expect(dialog).toBeVisible();
    // Top left: the site header, which neither the sheet nor the card covers.
    await page.mouse.click(4, 4);
    await expect(dialog).toHaveCount(0);
  });
});
