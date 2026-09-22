import { test, expect, type Page } from '@playwright/test';

async function sheetBox(page: Page) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog.evaluate((el) => {
    const sheet = el.getBoundingClientRect();
    const grid = document.querySelector('[data-testid="favorites-grid"]')?.getBoundingClientRect();
    const scroller = el.querySelector('.overflow-y-auto');
    return {
      sheetH: sheet.height,
      sheetTop: sheet.top,
      max: window.innerHeight - 56,
      gridTop: grid?.top ?? 0,
      scrollH: scroller?.scrollHeight ?? 0,
      clientH: scroller?.clientHeight ?? 0,
    };
  });
}

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

  test('selector sprites stay one size', async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    const cells = [
      { id: 'favorites-cell-normal-1', rows: [6, 6, 5, 5] },
      { id: 'favorites-cell-water-1', rows: [6, 6, 5, 5, 5, 5] },
      { id: 'favorites-cell-starter-1', rows: [6, 3] },
      { id: 'favorites-cell-legendary-4', rows: [5, 5, 4] },
    ];
    const widths: number[] = [];
    for (const cell of cells) {
      await page.getByTestId(cell.id).click();
      const grid = page.getByTestId('favorites-pretty-grid');
      await expect(grid).toBeVisible();
      const spec = await grid.evaluate((el) => {
        const img = el.querySelector('img');
        const rows = [...el.querySelectorAll('[data-pretty-row]')].map((row) =>
          Number(row.getAttribute('data-pretty-len')),
        );
        const dpr = window.devicePixelRatio || 1;
        const natural = Number(el.getAttribute('data-sprite-native')) || 96;
        const css = Number(el.getAttribute('data-sprite-px'));
        const dex = Number(el.getAttribute('data-sprite-dex'));
        const box = img?.getBoundingClientRect();
        const w = box?.width ?? 0;
        const widths = [...el.querySelectorAll('img')].map((node) => node.getBoundingClientRect().width);
        const six = el.querySelector('[data-pretty-len="6"]');
        const host = document.querySelector('[role="dialog"]') || document.querySelector('[data-testid="favorites-picker"]');
        const sb = six?.getBoundingClientRect();
        const hb = host?.getBoundingClientRect();
        const inside = !sb || !hb || (sb.left >= hb.left - 0.5 && sb.right <= hb.right + 0.5);
        return { css, dex, w, dpr, natural, rows, widths, max: Math.max(...rows, 0), inside };
      });
      expect(spec.rows, cell.id).toEqual(cell.rows);
      expect(spec.max, cell.id).toBeLessThanOrEqual(6);
      expect(spec.dex, cell.id).toBeGreaterThan(0);
      expect(spec.css, cell.id).toBeCloseTo(spec.dex, 0);
      expect(spec.inside, cell.id).toBe(true);
      if (spec.dex > spec.natural / Math.max(spec.dpr, 1) + 1) {
        expect(spec.css, cell.id).toBeGreaterThan(spec.natural / Math.max(spec.dpr, 1) + 1);
      }
      expect(Math.abs(spec.w - spec.css), cell.id).toBeLessThan(0.6);
      for (const w of spec.widths) expect(Math.abs(w - spec.w), cell.id).toBeLessThan(0.6);
      widths.push(spec.w);
      await page.getByRole('button', { name: 'Close picker' }).click();
    }
    expect(Math.abs(widths[0] - widths[1])).toBeLessThan(0.6);
    expect(Math.abs(widths[0] - widths[2])).toBeLessThan(0.6);
  });

  test('empty balls sit inside the cell', async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    await expect(page.getByTestId('favorites-empty-ball').first()).toBeVisible();
    const spec = await page.evaluate(() => {
      const balls = [...document.querySelectorAll('[data-testid="favorites-empty-ball"]')];
      let inside = 0;
      let centered = 0;
      let sample = { bw: 0, bh: 0, cw: 0, ch: 0 };
      for (const ball of balls) {
        const cell = ball.closest('button');
        const svg = ball.querySelector('svg');
        if (!cell || !svg) continue;
        const cb = cell.getBoundingClientRect();
        const bb = svg.getBoundingClientRect();
        if (!sample.cw) sample = { bw: bb.width, bh: bb.height, cw: cb.width, ch: cb.height };
        const pad = 0.75;
        if (
          bb.width > 8 &&
          bb.height > 8 &&
          bb.left >= cb.left - pad &&
          bb.right <= cb.right + pad &&
          bb.top >= cb.top - pad &&
          bb.bottom <= cb.bottom + pad
        ) inside += 1;
        const dx = Math.abs((bb.left + bb.right) / 2 - (cb.left + cb.right) / 2);
        const dy = Math.abs((bb.top + bb.bottom) / 2 - (cb.top + cb.bottom) / 2);
        if (dx < 1.5 && dy < 1.5) centered += 1;
      }
      return { count: balls.length, inside, centered, sample };
    });
    expect(spec.count).toBeGreaterThan(20);
    expect(spec.inside).toBe(spec.count);
    expect(spec.centered).toBe(spec.count);
    expect(spec.sample.bw).toBeLessThan(spec.sample.cw);
    expect(spec.sample.bh).toBeLessThan(spec.sample.ch);
  });

  test('a short selector sheet shrinks and a long one scrolls', async ({ page }) => {
    const viewport = page.viewportSize();
    expect(viewport).toBeTruthy();
    test.skip(viewport!.width >= 1024, 'desktop uses a side pane');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/favorite-pokemon-by-type');
    await page.getByTestId('favorites-cell-starter-1').click();
    const starter = await sheetBox(page);
    expect(starter.sheetH).toBeLessThan(starter.max - 40);
    expect(starter.sheetH).toBeGreaterThan(120);
    expect(starter.gridTop).toBeLessThan(starter.sheetTop - 8);
    expect(starter.scrollH).toBeLessThanOrEqual(starter.clientH + 2);
    const starterGrid = await page.getByTestId('favorites-pretty-grid').boundingBox();
    const starterDialog = await page.getByRole('dialog').boundingBox();
    expect(starterGrid).toBeTruthy();
    expect(starterDialog).toBeTruthy();
    expect(starterGrid!.y).toBeGreaterThanOrEqual(starterDialog!.y);
    expect(starterGrid!.y + starterGrid!.height).toBeLessThanOrEqual(starterDialog!.y + starterDialog!.height + 2);
    await page.getByRole('button', { name: 'Close picker' }).click();

    await page.setViewportSize({ width: 390, height: 480 });
    await page.getByTestId('favorites-cell-water-1').click();
    const water = await sheetBox(page);
    expect(water.sheetH).toBeLessThanOrEqual(water.max + 2);
    expect(water.sheetH).toBeGreaterThan(water.max - 8);
    expect(water.scrollH).toBeGreaterThan(water.clientH + 8);
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
