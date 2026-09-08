import { expect, test, type Locator, type Page } from '@playwright/test';
import { seedDex, TUNE_URL } from './support/dexSeed';

/**
 * Extraction is only correct if it is invisible in English: the same words, in
 * the same places, sourced from a catalog instead of a literal. A typo, a
 * dropped accent or a plural form that resolves differently would otherwise
 * slip through — `tsc` cannot see it, and the pseudo-locale specs deliberately
 * mangle the text so they cannot either.
 *
 * These pin the exact strings on the surfaces converted so far. Extend as more
 * are extracted; a failure here means the English copy moved, which is a real
 * change requiring a real decision, not a test to re-bless.
 *
 * Mobile only, because the desktop browser panel and the mobile sheet are both
 * in the DOM at once — scoping to the open sheet is what keeps these queries
 * unambiguous.
 */
test.describe('English copy is unchanged by extraction', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 1024, 'scoped to the mobile sheet');

  /** Open the selection sheet and return it, so queries can be scoped to it. */
  async function openBrowser(page: Page): Promise<Locator> {
    await page.goto(TUNE_URL);
    await seedDex(page);
    await page.getByRole('button', { name: /^Add a Pokémon to / }).first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    return sheet;
  }

  /** Chips live in a horizontally scrolling row, so bring one into view first. */
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
    // Fresh dex, so Analytics is still locked.
    await page.goto('/');
    await page.locator('[data-nav="analytics"]').click();
    await expect(page.getByText('Reach 25 Pokémon to unlock Analytics').first()).toBeVisible();
  });

  test('the browser search, count and empty state read as before', async ({ page }) => {
    const sheet = await openBrowser(page);

    const search = sheet.getByPlaceholder('Search by name or number...');
    await expect(search).toBeVisible();

    await expect(sheet.getByText(/^\d+ found$/)).toBeVisible();
    await search.fill('zzzzzz');
    await expect(sheet.getByText('No Pokémon found.')).toBeVisible();
    await expect(sheet.getByText('Try adjusting your filters.')).toBeVisible();
  });

  test('the filter chips and sheet titles read as before', async ({ page }) => {
    const sheet = await openBrowser(page);

    for (const label of ['Type', 'Gen', 'Stages', 'Shape', 'Color', 'Egg Group']) {
      await expect(await chip(sheet, label)).toBeVisible();
    }

    // Opening a filter shows its longer title — the pair that used to be two
    // hand-maintained copies of the same ten strings.
    await (await chip(sheet, 'Stages')).click();
    await expect(sheet.getByText('Evo Stages', { exact: true }).first()).toBeVisible();
    await expect(sheet.getByText('1 Stage', { exact: true })).toBeVisible();
    await expect(sheet.getByText('3+ Stage', { exact: true })).toBeVisible();
  });

  test('classification terms keep their in-game English names', async ({ page }) => {
    const sheet = await openBrowser(page);
    await (await chip(sheet, 'Egg Group')).click();

    // These deliberately use the in-game names rather than PokeAPI's internal
    // slugs — `ground` shows as Field, `plant` as Grass, `no-eggs` as
    // Undiscovered. Losing that mapping would be a silent regression.
    for (const label of ['Field', 'Grass', 'Human-Like', 'Amorphous', 'Undiscovered', 'Water 1']) {
      await expect(sheet.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });
});
