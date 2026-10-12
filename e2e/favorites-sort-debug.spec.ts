import { expect, test, type Page } from '@playwright/test';

const PAGE = '/favorite-pokemon-picker';
const REGIONAL_FIRST = 'unownLast,formKind,debut,tier,dex';

/** The open selector's entries, first to last, as `id:name`. */
async function selectorOrder(page: Page): Promise<string[]> {
  const grid = page.getByTestId('favorites-picker').getByTestId('favorites-pretty-grid');
  await expect(grid).toBeVisible();
  return grid.locator('[data-testid^="favorites-pick-"]').evaluateAll((tiles) =>
    tiles.map((tile) => `${tile.getAttribute('data-testid')!.slice('favorites-pick-'.length)}:${tile.getAttribute('aria-label')}`));
}

test('the sort debug panel reorders an open selector and stays off without its flag', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('sort-debug-reset')) return;
    localStorage.clear();
    sessionStorage.setItem('sort-debug-reset', '1');
  });

  // Users: no button, and a `sort` list in the URL changes nothing.
  await page.goto(`${PAGE}?sort=${REGIONAL_FIRST}`);
  await expect(page.getByTestId('favorites-grid')).toBeVisible();
  await expect(page.getByTestId('favorites-sort-debug-open')).toHaveCount(0);
  await page.getByTestId('favorites-cell-normal-gimmick').click();
  const userOrder = await selectorOrder(page);

  await page.goto(`${PAGE}?sortdebug=1`);
  await page.getByTestId('favorites-cell-normal-gimmick').click();
  const defaultOrder = await selectorOrder(page);
  expect(defaultOrder).toEqual(userOrder);

  // A preset reorders the selector that is already open.
  await page.getByTestId('favorites-sort-debug-open').click();
  await page.getByTestId('favorites-sort-preset-regional-first').click();
  await expect(page.getByTestId('favorites-sort-order')).toHaveText(REGIONAL_FIRST);
  await expect(page).toHaveURL(new RegExp(`[?&]sort=${REGIONAL_FIRST}(?:&|$)`));
  const regionalFirstOrder = await selectorOrder(page);
  expect(regionalFirstOrder).not.toEqual(defaultOrder);
  expect(regionalFirstOrder.slice().sort()).toEqual(defaultOrder.slice().sort());
  // Regional first lists every regional variant before the first Mega.
  const firstMega = regionalFirstOrder.findIndex((entry) => entry.includes('Mega '));
  const lastRegional = regionalFirstOrder.findLastIndex((entry) => /^\d+:(Alolan|Galarian|Hisuian|Paldean) /.test(entry));
  expect(lastRegional).toBeGreaterThanOrEqual(0);
  expect(lastRegional).toBeLessThan(firstMega);

  // The move buttons and checkboxes edit the same list as the presets.
  await page.getByTestId('favorites-sort-preset-default').click();
  await expect(page.getByTestId('favorites-sort-order')).toHaveText('unownLast,debut,formKind,tier,dex');
  await page.getByTestId('favorites-sort-down-debut').click();
  await expect(page.getByTestId('favorites-sort-order')).toHaveText(REGIONAL_FIRST);
  await expect(page.getByTestId('favorites-sort-preset-regional-first')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('favorites-sort-toggle-legendaryLast').check();
  await expect(page.getByTestId('favorites-sort-order')).toHaveText('unownLast,formKind,debut,tier,legendaryLast,dex');
  await page.getByTestId('favorites-sort-toggle-legendaryLast').uncheck();
  expect(await selectorOrder(page)).toEqual(regionalFirstOrder);

  // The choice has its own storage key and survives a reload.
  expect(await page.evaluate(() => ({
    order: localStorage.getItem('personal-151-favorites-sort-order-v1'),
    picks: localStorage.getItem('favorite-picker'),
  }))).toEqual({ order: REGIONAL_FIRST, picks: null });
  await page.goto(`${PAGE}?sortdebug=1`);
  await page.getByTestId('favorites-sort-debug-open').click();
  await expect(page.getByTestId('favorites-sort-preset-regional-first')).toHaveAttribute('aria-pressed', 'true');

  await testInfo.attach('orders.json', {
    body: JSON.stringify({ default: defaultOrder, regionalFirst: regionalFirstOrder }, null, 2),
    contentType: 'application/json',
  });
});
