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
    await page.addInitScript(() => {
      if (sessionStorage.getItem('favorites-test-reset')) return;
      localStorage.removeItem('favorite-picker');
      sessionStorage.setItem('favorites-test-reset', '1');
    });
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
      { id: 'favorites-cell-normal-1' },
      { id: 'favorites-cell-water-1' },
      { id: 'favorites-cell-starter-1' },
      { id: 'favorites-cell-legendary-4' },
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
        const widths = [...el.querySelectorAll('img[alt]:not([alt=""])')].map(
          (node) => node.getBoundingClientRect().width,
        );
        const six = el.querySelector('[data-pretty-len="6"]');
        const host = document.querySelector('[role="dialog"]') || document.querySelector('[data-testid="favorites-picker"]');
        const sb = six?.getBoundingClientRect();
        const hb = host?.getBoundingClientRect();
        const inside = !sb || !hb || (sb.left >= hb.left - 0.5 && sb.right <= hb.right + 0.5);
        return { css, dex, w, dpr, natural, rows, widths, max: Math.max(...rows, 0), inside };
      });
      expect(spec.rows.length, cell.id).toBeGreaterThan(0);
      expect(spec.rows.every((len) => len >= 1 && len <= 6), cell.id).toBe(true);
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

  test('a short selector stays compact and a tall selector fits without scrolling', async ({ page }) => {
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

    await page.setViewportSize({ width: 390, height: 650 });
    await page.getByTestId('favorites-cell-gimmick-8').click();
    const gimmick = await sheetBox(page);
    expect(gimmick.sheetH).toBeLessThanOrEqual(gimmick.max + 2);
    expect(gimmick.scrollH).toBeLessThanOrEqual(gimmick.clientH + 2);
    const fit = await page.getByTestId('favorites-pretty-grid').evaluate((el) => {
      const grid = el.getBoundingClientRect();
      const body = el.closest('.overflow-y-auto')?.getBoundingClientRect();
      const images = [...el.querySelectorAll('img[alt]:not([alt=""])')];
      const widths = images.map((image) => image.getBoundingClientRect().width);
      return {
        rowCount: el.querySelectorAll('[data-pretty-row]').length,
        top: grid.top,
        bottom: grid.bottom,
        left: grid.left,
        right: grid.right,
        bodyTop: body?.top ?? 0,
        bodyBottom: body?.bottom ?? 0,
        bodyCenter: body ? (body.left + body.right) / 2 : 0,
        minWidth: Math.min(...widths),
        maxWidth: Math.max(...widths),
      };
    });
    expect(fit.rowCount).toBeGreaterThanOrEqual(9);
    expect(fit.top).toBeGreaterThanOrEqual(fit.bodyTop - 1);
    expect(fit.bottom).toBeLessThanOrEqual(fit.bodyBottom + 1);
    expect(Math.abs((fit.left + fit.right) / 2 - fit.bodyCenter)).toBeLessThan(3);
    expect(fit.maxWidth - fit.minWidth).toBeLessThan(0.6);
  });

  test('every Gen 8 gimmick sprite loads with visible pixels', async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    await page.getByTestId('favorites-cell-gimmick-8').click();
    const grid = page.getByTestId('favorites-pretty-grid');
    await expect(grid).toBeVisible();
    const images = grid.locator('button img[src^="/sprites/pokemon/"]');
    expect(await images.count()).toBeGreaterThan(50);
    await expect.poll(async () => images.evaluateAll((nodes) => nodes.every((node) => {
      const image = node as HTMLImageElement;
      return image.complete && image.naturalWidth > 0;
    })), { timeout: 10_000 }).toBe(true);
    const blank = await images.evaluateAll((nodes) => nodes.flatMap((node) => {
      const image = node as HTMLImageElement;
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) return [image.src];
      context.drawImage(image, 0, 0);
      const alpha = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < alpha.length; i += 4) if (alpha[i] > 0) return [];
      return [image.src];
    }));
    expect(blank).toEqual([]);
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
    await page.getByTestId('favorites-cell-starter-1').click();
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
    const marks = await page.getByTestId('favorites-pack-option').first().evaluate((option) => {
      const old = option.querySelector('[data-testid="favorites-pack-old-mark"]');
      const next = option.querySelector('[data-testid="favorites-pack-new-mark"]');
      const oldSlot = old?.closest('[data-testid="favorites-pack-slot"]');
      const newSlot = next?.closest('[data-testid="favorites-pack-slot"]');
      const oldImage = oldSlot?.querySelector('[data-testid="favorites-pack-sprite"]');
      const newImage = newSlot?.querySelector('[data-testid="favorites-pack-sprite"]');
      const oldBox = old?.getBoundingClientRect();
      const newBox = next?.getBoundingClientRect();
      const oldSlotBox = oldSlot?.getBoundingClientRect();
      const newSlotBox = newSlot?.getBoundingClientRect();
      return {
        outlined: [...option.querySelectorAll('[data-testid="favorites-pack-slot"]')].some(
          (el) => Number.parseFloat(getComputedStyle(el).borderTopWidth) > 0,
        ),
        oldRight: oldBox && oldSlotBox ? oldBox.right > oldSlotBox.left + oldSlotBox.width / 2 : false,
        newRight: newBox && newSlotBox ? newBox.right > newSlotBox.left + newSlotBox.width / 2 : false,
        oldAbove: old && oldImage ? Number(getComputedStyle(old).zIndex) > Number(getComputedStyle(oldImage).zIndex) : false,
        newAbove: next && newImage ? Number(getComputedStyle(next).zIndex) > Number(getComputedStyle(newImage).zIndex) : false,
      };
    });
    expect(marks).toEqual({ outlined: false, oldRight: true, newRight: true, oldAbove: true, newAbove: true });
  });

  test('an empty cell takes a move without a packing sheet', async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    await page.getByTestId('favorites-cell-poison-1').click();
    await page.getByTestId('favorites-pick-34').click();
    await page.getByTestId('favorites-cell-ground-1').click();
    await page.getByTestId('favorites-pick-76').click();
    await expect(page.getByTestId('favorites-picker')).toBeHidden();
    await page.getByTestId('favorites-cell-rock-1').click();
    await page.getByTestId('favorites-pick-76').click();
    await expect(page.getByTestId('favorites-packing')).toHaveCount(0);
    await expect(page.getByTestId('favorites-picker')).toBeHidden();
    await expect(page.getByTestId('favorites-cell-rock-1').locator('img[alt]')).toHaveAttribute('alt', /golem/i);
    await expect(page.getByTestId('favorites-cell-ground-1').locator('img[alt]')).toHaveCount(0);
    await expect(page.getByTestId('favorites-cell-poison-1').locator('img[alt]')).toHaveAttribute('alt', /nidoking/i);
  });

  test('a trash chain writes the incoming Pokémon into the opened cell', async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    await page.getByTestId('favorites-cell-fairy-2').click();
    await page.getByTestId('favorites-pick-176').click();
    await page.getByTestId('favorites-cell-water-2').click();
    await page.getByTestId('favorites-pick-184').click();
    await page.getByTestId('favorites-cell-fairy-2').click();
    await page.getByTestId('favorites-pick-184').click();
    await expect(page.getByTestId('favorites-packing')).toBeVisible();
    const trash = page.locator('[data-testid="favorites-pack-option"]').filter({
      has: page.locator('[data-role="trash"]'),
    });
    await trash.first().click();
    await expect(page.getByTestId('favorites-picker')).toBeHidden();
    const fills = await page.evaluate(() => {
      const raw = localStorage.getItem('favorite-picker');
      const state = raw ? JSON.parse(raw).state.fills : {};
      return state as Record<string, number>;
    });
    expect(fills['fairy|2']).toBe(184);
    expect(fills['water|2']).toBeUndefined();
    expect(Object.values(fills)).not.toContain(176);
  });

  test('a direct trash swap replaces the old pick without a packing sheet', async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    await page.getByTestId('favorites-cell-electric-1').click();
    await page.getByTestId('favorites-pick-25').click();
    await page.getByTestId('favorites-cell-electric-1').click();
    await page.getByTestId('favorites-pick-26').click();
    await expect(page.getByTestId('favorites-packing')).toHaveCount(0);
    await expect(page.getByTestId('favorites-picker')).toBeHidden();
    await expect(page.getByTestId('favorites-cell-electric-1').locator('img[alt]')).toHaveAttribute('alt', /raichu/i);
    const fills = await page.evaluate(() => JSON.parse(localStorage.getItem('favorite-picker') ?? '{}').state?.fills);
    expect(fills['electric|1']).toBe(26);
  });

  test('the minimap shows only body cells during scroll and fades after idle', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/favorite-pokemon-by-type');
    await page.getByTestId('favorites-cell-fire-1').click();
    await page.getByTestId('favorites-pick-4').click();
    const scroller = page.getByTestId('favorites-grid-scroll');
    await scroller.evaluate((el) => { el.scrollLeft = 200; });
    const map = page.getByTestId('favorites-minimap');
    await expect(map).toBeVisible();
    expect(await map.locator('[data-kind]').count()).toBe(22 * 11);
    await expect(map.locator('[data-filled="true"]')).not.toHaveCount(0);
    await expect(map.locator('[data-filled="false"]')).not.toHaveCount(0);
    const viewport = page.getByTestId('favorites-minimap-viewport');
    const border = await viewport.evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(border).not.toBe('rgb(0, 0, 0)');
    await expect.poll(() => map.evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 2_500 }).toBeLessThan(0.05);
  });

  test('filled sprites can paint outside the cell boundary', async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    await page.getByTestId('favorites-cell-fire-1').click();
    await page.getByTestId('favorites-pick-4').click();
    const overflow = await page.getByTestId('favorites-cell-fire-1').evaluate((el) => {
      const style = getComputedStyle(el);
      return { x: style.overflowX, y: style.overflowY };
    });
    expect(overflow).toEqual({ x: 'visible', y: 'visible' });
  });

  test('selector type icons stay in type columns', async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    await page.getByTestId('favorites-cell-fire-1').click();
    await expect(page.getByTestId('favorites-type-icon').first()).toBeVisible();
    await page.getByRole('button', { name: 'Close picker' }).click();
    await page.getByTestId('favorites-cell-gimmick-8').click();
    await expect(page.getByTestId('favorites-type-icon')).toHaveCount(0);
    await page.getByRole('button', { name: 'Close picker' }).click();
    await page.getByTestId('favorites-cell-legendary-1').click();
    await expect(page.getByTestId('favorites-type-icon')).toHaveCount(0);
  });

  test('overall favorite includes both category favorites and the legendary favorite', async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    await page.evaluate(() => {
      localStorage.setItem('favorite-picker', JSON.stringify({
        state: { fills: {
          'fire|1': 4,
          'fire|favorite': 4,
          'favorite|1': 4,
          'legendary|1': 144,
          'legendary|legendary': 144,
        } },
        version: 1,
      }));
    });
    await page.reload();
    await page.getByTestId('favorites-cell-favorite-favorite').click();
    const both = page.getByTestId('favorites-pick-4');
    await expect(both).toBeVisible();
    await expect(both.locator('[data-testid="favorites-pointer-mark"][data-source="gen"]')).toBeVisible();
    await expect(both.locator('[data-testid="favorites-pointer-mark"][data-source="type"]')).toBeVisible();
    const legendary = page.getByTestId('favorites-pick-144');
    await expect(legendary).toBeVisible();
    await expect(legendary.locator('[data-testid="favorites-pointer-mark"][data-source="legendary"]')).toBeVisible();
    const opacity = await both.locator('img').first().evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(opacity).toBe(1);
  });
});
