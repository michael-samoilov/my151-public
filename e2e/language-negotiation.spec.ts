import { expect, test } from '@playwright/test';

/**
 * The contract for how the app picks a language, and for the way out.
 *
 * Detection is `navigator.languages` — the ordered list the visitor set in
 * their browser or OS. Not IP geolocation, which answers a different question:
 * Switzerland has four national languages, Canada two, and plenty of people
 * read English in countries where it is nobody's first language. The browser's
 * own preference list is the only signal that reflects what someone actually
 * wants to read.
 *
 * These run against the production bundle, which is the point. The picker was
 * previously behind `PREVIEW_FEATURES` while negotiation was not, so a
 * production visitor could be moved out of English automatically and then find
 * no control to move back — and `?lang=en` does not persist, so there was no
 * way out at all. The tests below are what stop that combination returning: a
 * preview-only assertion would have passed happily throughout.
 */

/** The Japanese for the Bug type, from Scarlet/Violet's own `typename` table. */
const BUG_JA = 'むし';
const BUG_EN = 'BUG';

async function openTypeFilter(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /^Add a Pokémon to / }).first().click();
  await page.getByRole('button', { name: 'Type', exact: true }).first().click();
  const grid = page.locator('[data-testid="type-filter"]');
  await expect(grid.locator('svg[role="img"]')).toHaveCount(18);
  return grid;
}

const typeNames = (grid: import('@playwright/test').Locator) =>
  grid.evaluate((root) =>
    Array.from(root.querySelectorAll('svg[role="img"] text')).map((t) => t.textContent ?? ''),
  );

test.describe('language negotiation', () => {
  test('a Japanese browser gets Japanese without being asked', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'ja-JP' });
    const page = await ctx.newPage();
    await page.goto('/pokedex-builder');
    expect(await typeNames(await openTypeFilter(page))).toContain(BUG_JA);
    await ctx.close();
  });

  test('an unsupported language falls back to English rather than to nothing', async ({ browser }) => {
    // Portuguese is not one of the nine. The negotiation must not match it on a
    // near-miss or leave the catalog empty; it must land on English.
    const ctx = await browser.newContext({ locale: 'pt-BR' });
    const page = await ctx.newPage();
    await page.goto('/pokedex-builder');
    expect(await typeNames(await openTypeFilter(page))).toContain(BUG_EN);
    await ctx.close();
  });

  test('the switcher is present in the production bundle', async ({ page }) => {
    await page.goto('/pokedex-builder');
    await expect(page.getByRole('button', { name: /language/i })).toBeVisible();
  });

  test('a visitor moved out of English can get back, and it sticks', async ({ browser }, testInfo) => {
    // The whole point. Someone with a Japanese browser who wants English must be
    // able to say so and have it survive a reload — otherwise every visit undoes
    // the choice and the app argues with them forever.
    const ctx = await browser.newContext({ locale: 'ja-JP' });
    const page = await ctx.newPage();
    await page.goto('/pokedex-builder');

    await page.getByRole('button', { name: '言語を変更', exact: true }).click();
    await page.getByRole('menuitemradio', { name: /English/ }).click();

    await expect
      .poll(async () => typeNames(await openTypeFilter(page)))
      .toContain(BUG_EN);

    // Reload with the same Japanese browser: the stored choice must outrank
    // detection, or the visitor is switched back on their next visit.
    await page.goto('/pokedex-builder');
    expect(await typeNames(await openTypeFilter(page))).toContain(BUG_EN);
    await testInfo.attach('language-roundtrip', {
      body: Buffer.from(JSON.stringify({
        browserLanguage: await page.evaluate(() => navigator.language),
        documentLanguage: await page.locator('html').getAttribute('lang'),
        typesAfterReload: await typeNames(page.locator('[data-testid="type-filter"]')),
      })),
      contentType: 'application/json',
    });
    await ctx.close();
  });

  test('an English browser is left alone', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'en-US' });
    const page = await ctx.newPage();
    await page.goto('/pokedex-builder');
    expect(await typeNames(await openTypeFilter(page))).toContain(BUG_EN);
    await ctx.close();
  });
});
