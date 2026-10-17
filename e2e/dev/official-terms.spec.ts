import { expect, test } from '@playwright/test';
import { seedDex, TUNE_URL } from '../support/dexSeed';

const TYPE_NAMES: Record<string, { fire: string; psychic: string }> = {
  ja: { fire: 'ほのお', psychic: 'エスパー' },
  ko: { fire: '불꽃', psychic: '에스퍼' },
  'zh-Hant': { fire: '火', psychic: '超能力' },
  fr: { fire: 'Feu', psychic: 'Psy' },
  de: { fire: 'Feuer', psychic: 'Psycho' },
  es: { fire: 'Fuego', psychic: 'Psíquico' },
  it: { fire: 'Fuoco', psychic: 'Psico' },
};

test.describe('official terminology', () => {
  for (const [locale, names] of Object.entries(TYPE_NAMES)) {
    test(`${locale}: type names come from the games`, async ({ page }) => {
      await page.goto(`/pokedex-builder?tune&lang=${locale}`);
      await seedDex(page);
      await page.locator('[data-nav="analytics"]').click();

      await expect(page.locator('svg text').filter({ visible: true }).filter({ hasText: names.fire }).first()).toBeVisible();
      await expect(page.locator('svg text').filter({ visible: true }).filter({ hasText: names.psychic }).first()).toBeVisible();
    });
  }

  test('ja: egg groups and colours are localised in the browser', async ({ page }) => {
    await page.goto('/pokedex-builder?tune&lang=ja');
    await seedDex(page);
    await page.locator('[data-add-slot]:visible').first().click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    const eggGroup = sheet.locator('[data-filter-chip="eggGroup"]').first();
    await eggGroup.scrollIntoViewIfNeeded();
    await eggGroup.click();
    await expect(sheet.getByText('りくじょう').first()).toBeVisible();
  });

  test('en is unaffected', async ({ page }) => {
    await page.goto(TUNE_URL);
    await seedDex(page);
    await page.locator('[data-nav="analytics"]').click();
    await expect(page.locator('svg text').filter({ visible: true }).filter({ hasText: 'Fire' }).first()).toBeVisible();
  });
});
