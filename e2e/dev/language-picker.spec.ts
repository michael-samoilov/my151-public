import { expect, test } from '@playwright/test';
import { seedDex } from '../support/milestoneHeader';

/**
 * The picker is preview-only for now, so it runs against the dev server like
 * the other gated features.
 */
test.describe('language picker', () => {
  test.describe('switching', () => {
    // Desktop width, so this exercises the dropdown. The seeded-dex tests need
    // ?tune to reach the store, and the tune panel is docked bottom-centre at
    // mobile widths where it covers the bottom sheet's lower rows.
    test.use({ viewport: { width: 1280, height: 800 } });

    test('switches the app to a locale and persists the choice', async ({ page }) => {
      await page.goto('/?tune');
      await seedDex(page);

      await page.getByRole('button', { name: 'Change language' }).click();
      await page.getByRole('menuitemradio', { name: '日本語' }).click();

      // Official terminology follows immediately.
      await page.locator('[data-nav="analytics"]').click();
      await expect(page.locator('svg text').filter({ hasText: 'ほのお' }).first()).toBeVisible();

      // The document language changes too — it drives the per-script font stacks
      // and tells a screen reader which voice to use.
      await expect(page.locator('html')).toHaveAttribute('lang', 'ja');

      // Chosen locales are pinned, so a reload keeps them.
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    });
  });

  test('offers endonyms, not flags, and marks the active one', async ({ page }) => {
    await page.goto('/?tune');
    await page.getByRole('button', { name: 'Change language' }).click();

    for (const endonym of ['English', '日本語', '한국어', '简体中文', '繁體中文', 'Français', 'Deutsch', 'Español', 'Italiano']) {
      await expect(page.getByRole('menuitemradio', { name: endonym })).toBeVisible();
    }
    await expect(page.getByRole('menuitemradio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('menuitemradio', { name: '日本語' })).toHaveAttribute('aria-checked', 'false');
  });

  test('each row declares its own language for screen readers', async ({ page }) => {
    await page.goto('/?tune');
    await page.getByRole('button', { name: 'Change language' }).click();
    // Without this a screen reader reads 日本語 through the page's English
    // voice, which is unintelligible.
    await expect(page.getByRole('menuitemradio', { name: '한국어' }).locator('span[lang="ko"]')).toBeVisible();
  });

  test('closes on Escape', async ({ page }) => {
    await page.goto('/?tune');
    await page.getByRole('button', { name: 'Change language' }).click();
    await expect(page.getByRole('menuitemradio', { name: '日本語' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menuitemradio', { name: '日本語' })).toBeHidden();
  });
});
