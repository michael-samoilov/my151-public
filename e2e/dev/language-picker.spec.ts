import { expect, test } from '@playwright/test';
import { seedDex } from '../support/dexSeed';

test.describe('language picker', () => {
  test.describe('switching', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('switches the app to a locale and persists the choice', async ({ page }) => {
      await page.goto('/pokedex-builder?tune');
      await seedDex(page);

      await page.getByRole('button', { name: 'Change language' }).click();
      await page.getByRole('menuitemradio', { name: '日本語' }).click();

      await page.locator('[data-nav="analytics"]').click();
      await expect(page.locator('svg text').filter({ visible: true }).filter({ hasText: 'ほのお' }).first()).toBeVisible();

      const patient = { timeout: 20_000 };
      await expect(page.locator('html')).toHaveAttribute('lang', 'ja', patient);

      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('lang', 'ja', patient);
    });
  });

  test('offers endonyms, not flags, and marks the active one', async ({ page }) => {
    await page.goto('/pokedex-builder?tune');
    await page.getByRole('button', { name: 'Change language' }).click();

    for (const endonym of ['English', '日本語', '한국어', '简体中文', '繁體中文', 'Français', 'Deutsch', 'Español', 'Italiano']) {
      await expect(page.getByRole('menuitemradio', { name: endonym })).toBeVisible();
    }
    await expect(page.getByRole('menuitemradio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('menuitemradio', { name: '日本語' })).toHaveAttribute('aria-checked', 'false');
  });

  test('each row declares its own language for screen readers', async ({ page }) => {
    await page.goto('/pokedex-builder?tune');
    await page.getByRole('button', { name: 'Change language' }).click();
    await expect(page.getByRole('menuitemradio', { name: '한국어' }).locator('span[lang="ko"]')).toBeVisible();
  });

  test('closes on Escape', async ({ page }) => {
    await page.goto('/pokedex-builder?tune');
    await page.getByRole('button', { name: 'Change language' }).click();
    await expect(page.getByRole('menuitemradio', { name: '日本語' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menuitemradio', { name: '日本語' })).toBeHidden();
  });
});
