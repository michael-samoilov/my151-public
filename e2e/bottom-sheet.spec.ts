import { expect, test } from './support/test';
import { seedDex, TUNE_URL } from './support/dexSeed';

test.describe('bottom sheet', { tag: '@viewport' }, () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 1024, 'the sheet is hidden at md and up');

  test('the selection sheet opens, is labelled, and closes from the handle', async ({ page }) => {
    await page.goto(TUNE_URL);
    await seedDex(page);

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
