import { expect, test } from '@playwright/test';

const BUG_JA = 'むし';
const BUG_EN = 'BUG';

async function openTypeFilter(page: import('@playwright/test').Page) {
  await page.locator('[data-add-slot]').first().click();
  await page.locator('[data-filter-chip="type"]').first().click();
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
    const ctx = await browser.newContext({ locale: 'ja-JP' });
    const page = await ctx.newPage();
    await page.goto('/pokedex-builder');

    await page.getByRole('button', { name: '言語を変更', exact: true }).click();
    await page.getByRole('menuitemradio', { name: /English/ }).click();

    await expect
      .poll(async () => typeNames(await openTypeFilter(page)))
      .toContain(BUG_EN);

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
