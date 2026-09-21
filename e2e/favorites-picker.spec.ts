import { test, expect } from '@playwright/test';

test.describe('favorite Pokémon picker', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('favorite-picker'));
  });

  test('type columns fit under the header', async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    const grid = page.getByTestId('favorites-grid');
    await expect(grid).toHaveAttribute('data-axis', 'gen-major');
    const viewport = page.viewportSize();
    expect(viewport).toBeTruthy();
    const box = await grid.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.y).toBeGreaterThan(40);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);

    if (viewport!.width >= 1024) {
      const wide = await grid.evaluate((el) => el.scrollWidth <= el.clientWidth + 2);
      expect(wide).toBe(true);
      return;
    }

    const scroll = page.getByTestId('favorites-grid-scroll');
    const metrics = await scroll.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth + 8);
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);

    const footer = page.getByText(/Nintendo/);
    const footerBox = await footer.boundingBox();
    expect(footerBox).toBeTruthy();
    expect(footerBox!.y).toBeGreaterThanOrEqual(viewport!.height - 1);

    const normalBefore = await page.getByTestId('favorites-cell-normal-1').boundingBox();
    const genBefore = await page.getByRole('img', { name: 'Generation I', exact: true }).boundingBox();
    await scroll.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    const normalAfter = await page.getByTestId('favorites-cell-normal-1').boundingBox();
    const favorite = await page.getByTestId('favorites-cell-favorite-1').boundingBox();
    const genAfter = await page.getByRole('img', { name: 'Generation I', exact: true }).boundingBox();
    expect(normalBefore).toBeTruthy();
    expect(normalAfter).toBeTruthy();
    expect(favorite).toBeTruthy();
    expect(genBefore).toBeTruthy();
    expect(genAfter).toBeTruthy();
    expect(normalAfter!.x).toBeLessThan(normalBefore!.x - 8);
    expect(favorite!.x).toBeGreaterThan(0);
    expect(favorite!.x).toBeLessThan(viewport!.width);
    expect(Math.abs(genAfter!.x - genBefore!.x)).toBeLessThan(2);
  });

  test('hub card opens the picker', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href="/favorite-pokemon-by-type"]').click();
    await expect(page).toHaveURL(/\/favorite-pokemon-by-type/);
    await expect(page.getByTestId('favorites-grid')).toBeVisible();
  });

  test('places a Pokémon in a type×gen cell', async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    await expect(page.getByTestId('favorites-grid')).toBeVisible();
    await page.getByTestId('favorites-cell-fire-1').click();
    await expect(page.getByTestId('favorites-picker')).toBeVisible();
    await page.getByTestId('favorites-pick-4').click();
    await expect(page.getByTestId('favorites-cell-fire-1').locator('img[alt]')).toHaveCount(1);
  });

  test('centres the last pretty-wrap row', async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    await page.getByTestId('favorites-cell-electric-5').click();
    const grid = page.getByTestId('favorites-pretty-grid');
    await expect(grid).toBeVisible();
    const last = grid.locator('[data-pretty-row]').last();
    const first = grid.locator('[data-pretty-row]').first();
    const lastBox = await last.boundingBox();
    const firstBox = await first.boundingBox();
    const lastLen = Number(await last.getAttribute('data-pretty-len'));
    const firstLen = Number(await first.getAttribute('data-pretty-len'));
    expect(firstLen).toBeGreaterThan(lastLen);
    expect(lastBox).toBeTruthy();
    expect(firstBox).toBeTruthy();
    const lastTiles = last.locator('button');
    const firstTiles = first.locator('button');
    const lastFirst = await lastTiles.first().boundingBox();
    const firstFirst = await firstTiles.first().boundingBox();
    expect(lastFirst).toBeTruthy();
    expect(firstFirst).toBeTruthy();
    expect(lastFirst!.x).toBeGreaterThan(firstFirst!.x + 4);
  });

  test('packing vacate shows the incoming Pokémon faded', async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    await page.getByTestId('favorites-cell-fairy-2').click();
    await page.getByTestId('favorites-pick-176').click();
    await page.getByTestId('favorites-cell-water-2').click();
    await page.getByTestId('favorites-pick-184').click();
    await page.getByTestId('favorites-cell-fairy-2').click();
    await page.getByTestId('favorites-pick-184').click();
    const vacate = page.locator('[data-testid="favorites-pack-slot"][data-role="vacate"]').first();
    await expect(vacate).toBeVisible();
    const sprite = vacate.locator('img').last();
    await expect(sprite).toBeVisible();
    const opacity = await sprite.evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacity)).toBeLessThan(0.5);
  });
});
