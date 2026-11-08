import { expect, test } from './support/test';

test('the mobile sheet header returns from packing before it closes the picker', { tag: '@viewport' }, async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 1024, 'desktop uses a side pane');

  await page.addInitScript(() => {
    localStorage.setItem('favorite-picker', JSON.stringify({
      state: { fills: { 'water|2': 184, 'fairy|2': 40 } },
      version: 1,
    }));
  });
  await page.goto('/favorite-pokemon-picker?packing=1');
  await page.getByTestId('favorites-cell-fairy-2').click();
  const sheet = page.getByRole('dialog');
  const header = page.getByTestId('bottom-sheet-header');
  await expect(sheet).toBeVisible();
  await page.getByTestId('favorites-pick-184').click();
  await expect(page.getByTestId('favorites-packing')).toBeVisible();
  await expect(header).toHaveAttribute('aria-label', 'Pick a different Pokémon');

  await header.click();
  await expect(page.getByTestId('favorites-packing')).toHaveCount(0);
  await expect(page.getByTestId('favorites-pretty-grid')).toBeVisible();

  await header.click();
  await expect(sheet).toHaveCount(0);
});
