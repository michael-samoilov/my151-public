import { expect, test } from '@playwright/test';
import { seedDex, TUNE_URL } from '../support/dexSeed';

/**
 * The first genuinely user-visible localisation: official in-game terminology.
 *
 * These strings are *sourced* from PokeAPI rather than translated, so they can
 * ship ahead of everything else — and they are the ones where a machine
 * translation would be most dangerous, since a plausible-sounding wrong word
 * for a Pokémon type reads as authoritative.
 *
 * The rest of the UI is still English at this point, which is the intended
 * intermediate state, not a bug.
 */

/** Type names as the games publish them, in each locale. */
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
      await page.goto(`/?tune&lang=${locale}`);
      await seedDex(page);
      await page.locator('[data-nav="analytics"]').click();

      // The type chart labels every row with the type's published name. Scoped
      // to visible text because the browser panel is mounted-but-hidden on this
      // page, and its type filter now renders the same words inside its badges.
      await expect(page.locator('svg text').filter({ visible: true }).filter({ hasText: names.fire }).first()).toBeVisible();
      await expect(page.locator('svg text').filter({ visible: true }).filter({ hasText: names.psychic }).first()).toBeVisible();
    });
  }

  test('ja: egg groups and colours are localised in the browser', async ({ page }) => {
    await page.goto('/?tune&lang=ja');
    await seedDex(page);
    await page.getByRole('button', { name: /^Add a Pokémon to / }).first().click();

    // Scoped to the open sheet: the desktop browser panel is in the DOM too.
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    const eggGroup = sheet.getByText('Egg Group', { exact: true }).first();
    await eggGroup.scrollIntoViewIfNeeded();
    await eggGroup.click();
    // りくじょう is the Field group. ground -> Field is exactly the mapping that
    // would break if the app rendered PokeAPI's internal slug instead of the
    // published term.
    await expect(sheet.getByText('りくじょう').first()).toBeVisible();
  });

  test('en is unaffected', async ({ page }) => {
    await page.goto(TUNE_URL);
    await seedDex(page);
    await page.locator('[data-nav="analytics"]').click();
    await expect(page.locator('svg text').filter({ visible: true }).filter({ hasText: 'Fire' }).first()).toBeVisible();
  });
});
