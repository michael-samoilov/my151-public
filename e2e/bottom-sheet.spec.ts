import { expect, test } from '@playwright/test';
import { seedDex, TUNE_URL } from './support/dexSeed';

/**
 * The builder's selection sheet and the View settings sheet were two
 * near-identical copies of the same drag-to-dismiss bottom sheet; they now
 * share one primitive. These cover what that primitive owns — it opens, it is
 * labelled, tapping the grab handle closes it, and Escape closes it (which only
 * one of the two copies used to do).
 *
 * Mobile only: the sheet is `md:hidden`, and both callers show something else
 * entirely at desktop widths.
 */
test.describe('bottom sheet', { tag: '@viewport' }, () => {
  // Keyed on width, not on touch emulation — `md:` is a 1024px breakpoint, so
  // the 320px project renders the sheet despite not being a touch device.
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 1024, 'the sheet is hidden at md and up');

  test('the selection sheet opens, is labelled, and closes from the handle', async ({ page }) => {
    await page.goto(TUNE_URL);
    await seedDex(page);

    // Any section's "add" button opens the browser sheet.
    await page.getByRole('button', { name: /^Add a Pokémon to / }).first().click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute('aria-label', /.+/);

    await sheet.getByRole('button').first().click();
    await expect(sheet).toBeHidden();
  });

  test('the View settings sheet closes on Escape', async ({ page }) => {
    await page.goto(TUNE_URL);
    await seedDex(page);
    await page.locator('[data-nav="view"]').click();

    await page.getByRole('button', { name: 'View settings' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });
});
