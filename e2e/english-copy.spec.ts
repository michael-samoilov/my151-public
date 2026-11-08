import { expect, test, type Locator, type Page } from './support/test';
import { seedDex, TUNE_URL } from './support/dexSeed';

test.describe('English copy is unchanged by extraction', { tag: '@viewport' }, () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 1024, 'scoped to the mobile sheet');

  async function openBrowser(page: Page): Promise<Locator> {
    await page.goto(TUNE_URL);
    await seedDex(page);
    await page.getByRole('button', { name: /^Add a Pokémon to / }).first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    return sheet;
  }

  async function chip(sheet: Locator, label: string): Promise<Locator> {
    const el = sheet.getByText(label, { exact: true }).first();
    await el.scrollIntoViewIfNeeded();
    return el;
  }

  test('the header nav reads as before', async ({ page }) => {
    await page.goto(TUNE_URL);
    await expect(page.locator('[data-nav="builder"]')).toContainText('Build');
    await expect(page.locator('[data-nav="view"]')).toContainText('View');
  });

  test('the locked-analytics tooltip keeps its wording and count', async ({ page }) => {
    await page.goto('/pokedex-builder');
    await page.locator('[data-nav="analytics"]').click();
    await expect(page.getByText('Reach 25 Pokémon to unlock Analytics').first()).toBeVisible();
  });

  test('the browser search, count and empty state read as before', async ({ page }) => {
    const sheet = await openBrowser(page);

    const search = sheet.getByPlaceholder('Search by name or number...');
    await expect(search).toBeVisible();

    await expect(sheet.locator('[data-result-count]')).toHaveText(/^\d+ found$/);
    await search.fill('zzzzzz');
    await expect(sheet.getByRole('heading', { name: 'No Pokémon match “zzzzzz”' })).toBeVisible();
    await expect(sheet.getByText('Check the spelling, or search by Pokédex number.')).toBeVisible();
    await expect(sheet.getByTestId('browser-empty').getByRole('button', { name: 'Clear search' })).toBeVisible();
  });

  test('the filter chips and sheet titles read as before', async ({ page }) => {
    const sheet = await openBrowser(page);

    for (const label of ['Type', 'Gen', 'Stages', 'Shape', 'Color', 'Egg Group']) {
      await expect(await chip(sheet, label)).toBeVisible();
    }

    await (await chip(sheet, 'Stages')).click();
    await expect(sheet.getByText('Evo Stages', { exact: true }).first()).toBeVisible();
    await expect(sheet.getByText('1 Stage', { exact: true })).toBeVisible();
    await expect(sheet.getByText('3+ Stage', { exact: true })).toBeVisible();
  });

  test('classification terms keep their in-game English names', async ({ page }) => {
    const sheet = await openBrowser(page);
    await (await chip(sheet, 'Egg Group')).click();

    for (const label of ['Field', 'Grass', 'Human-Like', 'Amorphous', 'Undiscovered', 'Water 1']) {
      await expect(sheet.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });
});
