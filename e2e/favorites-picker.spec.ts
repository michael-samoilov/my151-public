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

async function seedFills(page: Page, fills: Record<string, number>) {
  await page.goto('/favorite-pokemon-by-type');
  await page.evaluate((saved) => {
    localStorage.setItem('favorite-picker', JSON.stringify({ state: { fills: saved }, version: 3 }));
  }, fills);
  await page.reload();
  await expect(page.getByTestId('favorites-grid')).toBeVisible();
}

/** Each listed pick's taken marks as `source:value`, and whether its sprite is faded. */
async function takenState(page: Page, ids: number[]) {
  const out: Record<number, { faded: boolean; marks: string[] }> = {};
  for (const id of ids) {
    const pick = page.getByTestId(`favorites-pick-${id}`);
    await expect(pick).toBeVisible();
    out[id] = await pick.evaluate((el) => ({
      faded: Number(getComputedStyle(el.querySelector('img[alt]:not([alt=""])')!).opacity) < 0.5,
      marks: [...(el.closest('[data-selector-tile]') ?? el).querySelectorAll('[data-testid="favorites-used-mark"]')].map(
        (mark) => `${mark.getAttribute('data-source')}:${mark.getAttribute('data-value') ?? ''}`,
      ),
    }));
  }
  return out;
}

async function savedFills(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('favorite-picker') ?? '{}').state?.fills ?? {});
}

test.describe('favorite Pokémon picker', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('favorites-test-reset')) return;
      localStorage.removeItem('favorite-picker');
      sessionStorage.setItem('favorites-test-reset', '1');
    });
  });

  test('type columns keep their header alignment while the chart scrolls', { tag: '@viewport' }, async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    const grid = page.getByTestId('favorites-grid');
    await expect(grid).toHaveAttribute('data-axis', 'gen-major');
    const viewport = page.viewportSize();
    expect(viewport).toBeTruthy();
    const box = await grid.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.y).toBeGreaterThan(40);
    if (viewport!.width >= 1024) {
      // Native-size sprites make the desktop chart taller than the viewport.
      // Scrolling the page is preferable to shrinking every sprite to fit.
      expect(box!.y + box!.height).toBeGreaterThan(viewport!.height);
      const scroll = page.getByTestId('favorites-grid-scroll');
      const metrics = await scroll.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth + 8);
      return;
    }

    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);

    const scroll = page.getByTestId('favorites-grid-scroll');
    const backgrounds = await scroll.evaluate((el) => ({
      table: getComputedStyle(el).backgroundColor,
      app: getComputedStyle(document.body).backgroundColor,
    }));
    expect(backgrounds.table).toBe(backgrounds.app);
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

  test('selector sprites stay one size', { tag: '@viewport' }, async ({ page }) => {
    // The desktop pane fits below the sticky header row. A 1200px-tall window
    // leaves room for the tallest of these selectors at the dex sprite size.
    const width = page.viewportSize()!.width;
    if (width >= 1024) await page.setViewportSize({ width, height: 1200 });
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
      await page.keyboard.press('Escape');
    }
    expect(Math.abs(widths[0] - widths[1])).toBeLessThan(0.6);
    expect(Math.abs(widths[0] - widths[2])).toBeLessThan(0.6);
  });

  test('empty balls sit inside the cell', { tag: '@viewport' }, async ({ page }) => {
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

  test('the starter, gimmick, legendary, and favorite headers show their icons', async ({ page }, testInfo) => {
    await page.goto('/favorite-pokemon-by-type');
    const icons = page.locator('[data-testid^="favorites-axis-icon-"]');
    // Four extra columns and three extra rows.
    await expect(icons).toHaveCount(7);
    await expect.poll(() => icons.evaluateAll((imgs) =>
      (imgs as HTMLImageElement[]).filter((img) => img.complete && img.naturalWidth > 0).length,
    )).toBe(7);
    const ids = await icons.evaluateAll((imgs) => imgs.map((img) => img.getAttribute('data-testid')));
    await testInfo.attach('axis-icons.json', { body: JSON.stringify(ids), contentType: 'application/json' });
    expect(new Set(ids)).toEqual(new Set(['starter', 'gimmick', 'legendary', 'favorite'].map((id) => `favorites-axis-icon-${id}`)));
  });

  test('column headers and the extra row headers show a badge under the icon, inside the header', { tag: '@viewport' }, async ({ page }, testInfo) => {
    await page.goto('/favorite-pokemon-by-type');
    const frame = page.getByTestId('favorites-grid-scroll');
    await expect(page.getByTestId('favorites-header-badge-normal')).toBeVisible();
    // Off-screen cells skip layout, so measure each end of the grid in view.
    const measure = () => page.evaluate(() => [...document.querySelectorAll('[data-testid^="favorites-header-badge-"]')].map((badge) => {
      const b = badge.getBoundingClientRect();
      const h = badge.closest('.overflow-hidden')!.getBoundingClientRect();
      const icon = badge.previousElementSibling!.getBoundingClientRect();
      // The gimmick, legendary, and favorite rows share ids with their columns.
      const row = badge.closest('[data-row-banded]') ? ':row' : '';
      return {
        id: (badge as HTMLElement).dataset.testid!.replace('favorites-header-badge-', '') + row,
        label: badge.querySelector('[role="img"]')?.getAttribute('aria-label'),
        inside: b.left >= h.left - 0.5 && b.right <= h.right + 0.5 && b.top >= h.top - 0.5 && b.bottom <= h.bottom + 0.5,
        belowIcon: b.top >= icon.bottom - 0.5,
        width: b.width / h.width,
      };
    }));
    const seen = new Map<string, Awaited<ReturnType<typeof measure>>[number]>();
    for (const end of ['start', 'end'] as const) {
      await frame.evaluate((el, e) => { el.scrollLeft = e === 'start' ? 0 : el.scrollWidth; el.scrollTop = e === 'start' ? 0 : el.scrollHeight; }, end);
      await page.waitForTimeout(300);
      for (const row of await measure()) seen.set(row.id, row);
    }
    // 22 columns, plus the gimmick, legendary, and favorite rows. The generation rows keep only their discs.
    expect([...seen.keys()]).toEqual(expect.arrayContaining(['normal', 'fairy', 'starter', 'legendary', 'gimmick', 'favorite', 'gimmick:row', 'legendary:row', 'favorite:row']));
    expect(seen.size).toBe(25);
    expect(seen.get('fire')!.label).toBe('Fire');
    expect(seen.get('starter')!.label).toBe('Starter');
    for (const row of seen.values()) {
      expect(row.inside, row.id).toBe(true);
      expect(row.belowIcon, row.id).toBe(true);
      expect(row.width, row.id).toBeGreaterThan(0.85);
    }
    await page.screenshot({ path: testInfo.outputPath('header-badges.png') });
    await testInfo.attach('header-badges', { path: testInfo.outputPath('header-badges.png'), contentType: 'image/png' });
  });

  test('pointer cells show an Ultra Ball, the last cell a Master Ball, and strokes stay in the cell', { tag: '@viewport' }, async ({ page }, testInfo) => {
    await page.goto('/favorite-pokemon-by-type');
    const frame = page.getByTestId('favorites-grid-scroll');
    await expect(page.getByTestId('favorites-empty-ball').first()).toBeVisible();
    // The Master Ball cell is the far corner, and off-screen empty cells skip layout.
    await frame.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
      el.scrollTop = el.scrollHeight;
    });
    const cells = ['fire-1', 'favorite-1', 'legendary-legendary', 'gimmick-gimmick', 'favorite-favorite'];
    await expect(page.getByTestId('favorites-cell-favorite-favorite')).toBeInViewport();
    const balls = await page.evaluate((ids) => ids.map((id) => {
      const cell = document.querySelector(`[data-testid="favorites-cell-${id}"]`)!;
      const ball = cell.querySelector<HTMLElement>('[data-testid="favorites-empty-ball"]');
      if (!ball) return { id, ball: null, margin: null };
      // Sample every stroke in screen space, so the tilt and the domes count.
      const cb = cell.getBoundingClientRect();
      let margin = Infinity;
      for (const shape of ball.querySelectorAll<SVGGeometryElement>('path, circle, line')) {
        const m = shape.getScreenCTM()!;
        const half = shape.getAttribute('stroke') === 'none' ? 0 : 0.75 * Math.hypot(m.a, m.b);
        const len = shape.getTotalLength();
        for (let i = 0; i <= 96; i++) {
          const p = shape.getPointAtLength((len * i) / 96).matrixTransform(m);
          margin = Math.min(margin, p.x - cb.left - half, cb.right - p.x - half, p.y - cb.top - half, cb.bottom - p.y - half);
        }
      }
      return { id, ball: ball.dataset.ball ?? null, margin: Math.round(margin * 10) / 10 };
    }), cells);
    await testInfo.attach('empty-balls.json', { body: JSON.stringify(balls, null, 1), contentType: 'application/json' });
    expect(balls.map((b) => b.ball)).toEqual(['poke', 'ultra', 'ultra', 'ultra', 'master']);
    for (const b of balls) expect(b.margin, b.id).toBeGreaterThanOrEqual(0);
  });

  test('a short selector stays compact and a tall origin selector fits every choice', { tag: '@viewport' }, async ({ page }, testInfo) => {
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
    await page.keyboard.press('Escape');

    await page.setViewportSize({ width: 390, height: 650 });
    await page.getByTestId('favorites-cell-gimmick-8').click();
    const gimmick = await sheetBox(page);
    expect(gimmick.sheetH).toBeLessThanOrEqual(gimmick.max + 2);
    expect(gimmick.scrollH).toBeLessThanOrEqual(gimmick.clientH + 1);
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
        nativeWidth: Number(el.getAttribute('data-sprite-dex')),
      };
    });
    expect(fit.rowCount).toBeGreaterThanOrEqual(9);
    expect(fit.top).toBeGreaterThanOrEqual(fit.bodyTop - 1);
    expect(fit.bottom).toBeLessThanOrEqual(fit.bodyBottom + 1);
    expect(Math.abs((fit.left + fit.right) / 2 - fit.bodyCenter)).toBeLessThan(3);
    expect(fit.maxWidth - fit.minWidth).toBeLessThan(0.6);
    expect(fit.minWidth).toBeLessThan(fit.nativeWidth);
    const lastPick = page.getByTestId('favorites-pretty-grid').locator('[data-testid^="favorites-pick-"]').last();
    await expect(lastPick).toBeInViewport();
    const lastId = Number((await lastPick.getAttribute('data-testid'))!.replace('favorites-pick-', ''));
    await lastPick.click();
    await expect(page.getByTestId('favorites-picker')).toBeHidden();
    expect((await savedFills(page))['gimmick|8']).toBe(lastId);
    await testInfo.attach('tall-selector-reachability.json', {
      body: JSON.stringify({ gimmick, fit, lastId }), contentType: 'application/json',
    });
  });

  test('generation discs match type badge area and alternating rows are subtly banded', { tag: '@viewport' }, async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    const grid = page.getByTestId('favorites-grid');
    const typeBadge = grid.locator(':scope > div').nth(1).locator('img');
    const genDisc = page.getByRole('img', { name: 'Generation I', exact: true });
    const typeBox = await typeBadge.boundingBox();
    const genBox = await genDisc.boundingBox();
    expect(typeBox).toBeTruthy();
    expect(genBox).toBeTruthy();
    const squareArea = typeBox!.width ** 2;
    const discArea = Math.PI * (genBox!.width * 15 / 32) ** 2;
    expect(Math.abs(discArea - squareArea) / squareArea).toBeLessThan(0.03);

    for (const [gen, banded] of [[1, 'false'], [2, 'true'], [3, 'false'], ['gimmick', 'true'], ['legendary', 'false'], ['favorite', 'false']] as const) {
      await expect(page.getByTestId(`favorites-cell-normal-${gen}`)).toHaveAttribute('data-row-banded', banded);
    }
    const nullTile = page.locator('[data-kind="null"]').first();
    await expect(nullTile).toBeVisible();
    const nullAppearance = await nullTile.evaluate((el) => ({
      overlay: el.querySelectorAll('span').length,
      background: getComputedStyle(el).backgroundImage,
    }));
    expect(nullAppearance.overlay).toBe(0);
    expect(nullAppearance.background).toContain('repeating-linear-gradient');
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

  test('centres the last pretty-wrap row', { tag: '@viewport' }, async ({ page }) => {
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

  test('packing shows one solid sprite per move with old and new marks', { tag: '@viewport' }, async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type?packing=1');
    await page.getByTestId('favorites-cell-fairy-2').click();
    await page.getByTestId('favorites-pick-176').click();
    await page.getByTestId('favorites-cell-water-2').click();
    await page.getByTestId('favorites-pick-184').click();
    await page.getByTestId('favorites-cell-fairy-2').click();
    await page.getByTestId('favorites-pick-184').click();
    const keep = page.getByTestId('favorites-pack-option').filter({
      hasNot: page.locator('[data-role="trash"]'),
    }).first();
    await expect(keep.getByTestId('favorites-pack-sprite')).toHaveCount(2);
    await expect(keep.getByAltText(/azumarill/i)).toHaveCount(1);
    await expect(keep.getByAltText(/togetic/i)).toHaveCount(1);
    expect(await keep.getByTestId('favorites-pack-sprite').evaluateAll((sprites) =>
      sprites.map((sprite) => Number(getComputedStyle(sprite).opacity)),
    )).toEqual([1, 1]);
    const marks = await keep.locator('[data-testid="favorites-pack-slot"]').first().evaluate((slot) => {
      const old = slot.querySelector('[data-testid="favorites-pack-old-mark"]');
      const arrow = slot.querySelector('[data-testid="favorites-pack-move-arrow"]');
      const next = slot.querySelector('[data-testid="favorites-pack-new-mark"]');
      const sprite = slot.querySelector('[data-testid="favorites-pack-sprite"]');
      const oldBox = old?.getBoundingClientRect();
      const arrowBox = arrow?.getBoundingClientRect();
      const newBox = next?.getBoundingClientRect();
      const slotBox = slot.getBoundingClientRect();
      return {
        outlined: Number.parseFloat(getComputedStyle(slot).borderTopWidth) > 0,
        marksInOrder: Boolean(oldBox && arrowBox && newBox && oldBox.right < arrowBox.left && arrowBox.right < newBox.left),
        oldLeft: Boolean(oldBox && oldBox.left <= slotBox.left + 1),
        newRight: Boolean(newBox && newBox.right >= slotBox.right - 1),
        oldAbove: Boolean(old && sprite && Number(getComputedStyle(old).zIndex) > Number(getComputedStyle(sprite).zIndex)),
        newAbove: Boolean(next && sprite && Number(getComputedStyle(next).zIndex) > Number(getComputedStyle(sprite).zIndex)),
        opacity: sprite ? Number(getComputedStyle(sprite).opacity) : 0,
      };
    });
    expect(marks).toEqual({ outlined: false, marksInOrder: true, oldLeft: true, newRight: true, oldAbove: true, newAbove: true, opacity: 1 });
    const trash = page.getByTestId('favorites-pack-option').filter({
      has: page.locator('[data-role="trash"]'),
    }).first();
    await expect(trash.getByTestId('favorites-pack-sprite')).toHaveCount(2);
    const opacities = await trash.getByTestId('favorites-pack-sprite').evaluateAll((sprites) =>
      sprites.map((sprite) => Number(getComputedStyle(sprite).opacity)),
    );
    expect(opacities[0]).toBe(1);
    expect(opacities[1]).toBeLessThan(0.5);
    await expect(trash.getByTestId('favorites-trash-mark')).toHaveCount(1);
    const trashMarks = await trash.locator('[data-role="trash"]').evaluate((slot) => {
      const old = slot.querySelector('[data-testid="favorites-pack-old-mark"]');
      const arrow = slot.querySelector('[data-testid="favorites-pack-move-arrow"]');
      const next = slot.querySelector('[data-testid="favorites-trash-mark"]');
      const sprite = slot.querySelector('[data-testid="favorites-pack-sprite"]');
      const box = slot.getBoundingClientRect();
      const a = old?.getBoundingClientRect();
      const b = arrow?.getBoundingClientRect();
      const c = next?.getBoundingClientRect();
      return {
        oldLeft: Boolean(a && a.left <= box.left + 1),
        arrowBetween: Boolean(a && b && c && a.right < b.left && b.right < c.left),
        trashRight: Boolean(c && c.right >= box.right - 1),
        iconAboveFade: Boolean(next && sprite && Number(getComputedStyle(next).zIndex) > Number(getComputedStyle(sprite).zIndex)),
      };
    });
    expect(trashMarks).toEqual({ oldLeft: true, arrowBetween: true, trashRight: true, iconAboveFade: true });
  });

  test('keeps Clear inside the selected pick and legendary rows contiguous', async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    await page.evaluate(() => localStorage.setItem('favorite-picker', JSON.stringify({
      state: { fills: { 'grass|6': 650, 'legendary|7': 718 } }, version: 1,
    })));
    await page.reload();
    await page.getByTestId('favorites-cell-grass-6').click();
    const rows = page.getByTestId('favorites-pretty-grid').locator('[data-pretty-row]');
    // The two removed pumpkin near-duplicates leave 9 picks, with no extra tile.
    expect(await rows.evaluateAll((els) => els.map((el) => Number(el.getAttribute('data-pretty-len'))))).toEqual([6, 3]);
    await expect(page.getByTestId('favorites-clear-row')).toHaveCount(0);
    await expect(page.getByTestId('favorites-pick-650').getByTestId('favorites-clear')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('favorites-cell-legendary-7').click();
    const legendaryRows = await rows.evaluateAll((els) => els.map((el) => Number(el.getAttribute('data-pretty-len'))));
    expect(legendaryRows.reduce((sum, len) => sum + len, 0)).toBe(await page.locator('[data-testid^="favorites-pick-"]').count());
    const firstShort = legendaryRows.findIndex((len) => len < 6);
    if (firstShort >= 0) expect(legendaryRows.slice(firstShort).every((len) => len < 6)).toBe(true);
    expect(legendaryRows.every((len) => len <= 6)).toBe(true);
    await expect(page.getByTestId('favorites-pick-10118')).toHaveCount(0);
    await expect(page.getByTestId('favorites-pick-10181')).toHaveCount(1);
  });

  test('selection ring encloses Vivillon type badges', { tag: '@viewport' }, async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    await page.evaluate(() => localStorage.setItem('favorite-picker', JSON.stringify({
      state: { fills: { 'bug|6': 666 } }, version: 1,
    })));
    await page.reload();
    await page.getByTestId('favorites-cell-bug-6').click();
    for (const id of [666, ...Array.from({ length: 19 }, (_, i) => 11018 + i)]) {
      await expect(page.getByTestId(`favorites-pick-${id}`)).toHaveCount(1);
    }
    const selected = page.getByTestId('favorites-pick-666');
    const ring = await selected.getByTestId('favorites-selection-ring').boundingBox();
    const badges = await selected.getByTestId('favorites-type-icon').all();
    expect(ring).toBeTruthy();
    expect(badges).toHaveLength(2);
    for (const badge of badges) {
      const box = await badge.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.x).toBeGreaterThanOrEqual(ring!.x);
      expect(box!.x + box!.width).toBeLessThanOrEqual(ring!.x + ring!.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(ring!.y + ring!.height);
    }
  });

  test('Gen 1 starter includes regular Pikachu and Eevee while Hisuian forms finish Gen 8', async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    await page.getByTestId('favorites-cell-starter-1').click();
    await expect(page.getByTestId('favorites-pick-25')).toHaveCount(1);
    await expect(page.getByTestId('favorites-pick-133')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await page.getByTestId('favorites-cell-starter-7').click();
    await expect(page.getByTestId('favorites-pick-10158')).toHaveCount(0);
    await expect(page.getByTestId('favorites-pick-10159')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByTestId('favorites-cell-starter-8').click();
    const ids = await page.getByTestId('favorites-pretty-grid').locator('[data-testid^="favorites-pick-"]').evaluateAll(
      (els) => els.map((el) => Number(el.getAttribute('data-testid')!.replace('favorites-pick-', ''))),
    );
    expect(ids.slice(-3)).toEqual([10233, 10236, 10244]);
  });

  test('Ultra Necrozma is selectable as a Gen 7 and legendary gimmick', async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    await page.getByTestId('favorites-cell-gimmick-7').click();
    await expect(page.getByTestId('favorites-pick-10157')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('favorites-cell-gimmick-legendary')).toBeDisabled();
    await page.getByTestId('favorites-cell-legendary-gimmick').click();
    await expect(page.getByTestId('favorites-pick-10157')).toBeVisible();
  });

  test('the Gimmick row includes starter-species forms and its intersection points to row and column picks', async ({ page }, testInfo) => {
    await page.goto('/favorite-pokemon-by-type');
    await expect(page.getByTestId('favorites-cell-gimmick-legendary')).toBeDisabled();
    await expect(page.getByTestId('favorites-cell-gimmick-favorite')).toBeDisabled();
    await expect(page.getByTestId('favorites-cell-favorite-gimmick')).toBeDisabled();
    await page.getByTestId('favorites-cell-starter-gimmick').click();
    await expect(page.getByTestId('favorites-pick-10034')).toBeVisible();
    await expect(page.getByTestId('favorites-pick-10199')).toBeVisible();
    await expect(page.getByTestId('favorites-pick-10205')).toBeVisible();
    await expect(page.getByTestId('favorites-pick-10304')).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.evaluate(() => localStorage.setItem('favorite-picker', JSON.stringify({
      state: { fills: {
        'gimmick|1': 10034,
        'fire|gimmick': 10034,
        'starter|gimmick': 10199,
        'legendary|gimmick': 10157,
      } },
      version: 3,
    })));
    await page.reload();
    await page.getByTestId('favorites-cell-gimmick-gimmick').click();
    await expect(page.getByTestId('favorites-origin-tile-10034').locator('[data-source="gen"]')).toBeVisible();
    await expect(page.getByTestId('favorites-origin-tile-10034').locator('[data-source="type"]')).toBeVisible();
    await expect(page.getByTestId('favorites-origin-tile-10199').locator('[data-source="starter"]')).toBeVisible();
    await expect(page.getByTestId('favorites-origin-tile-10157').locator('[data-source="legendary"]')).toBeVisible();
    await page.getByTestId('favorites-pretty-grid').screenshot({ path: testInfo.outputPath('gimmick-origins.png') });
  });

  test('empty favorite pickers explain the next step and return to the grid', async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    await page.getByTestId('favorites-cell-favorite-1').click();
    const empty = page.getByTestId('favorites-picker-empty');
    await expect(empty.getByRole('heading', { name: 'Nothing to choose yet' })).toBeVisible();
    await expect(empty.locator('svg')).toHaveCount(2); // ball plus back chevron
    await expect(empty).toContainText('generation');
    await empty.getByRole('button', { name: 'Back to grid' }).click();
    await expect(page.getByTestId('favorites-picker')).toBeHidden();
    await page.getByTestId('favorites-cell-fire-favorite').click();
    await expect(page.getByTestId('favorites-picker-empty')).toContainText('column');
  });

  test('mobile empty state clears the sheet heading and uses the themed Unown-inspired icon', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/favorite-pokemon-by-type');
    await page.getByTestId('favorites-cell-favorite-1').click();
    const header = page.getByTestId('bottom-sheet-header');
    const empty = page.getByTestId('favorites-picker-empty');
    const [headerBox, emptyBox] = await Promise.all([header.boundingBox(), empty.boundingBox()]);
    expect(headerBox).toBeTruthy();
    expect(emptyBox).toBeTruthy();
    expect(emptyBox!.y).toBeGreaterThan(headerBox!.y + headerBox!.height);
    await expect(empty.getByTestId('favorites-empty-unown').locator('path')).toHaveCount(2);
    await expect(empty.getByTestId('favorites-empty-unown').locator('circle')).toHaveCount(2);
    await expect(empty.getByRole('button', { name: 'Back to grid' })).toHaveClass(/border-border/);
    await page.screenshot({ path: testInfo.outputPath('favorite-empty-state.png') });
  });

  test('icons start visible and can be toggled from the opposite header corner', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/favorite-pokemon-by-type');
    await page.getByTestId('favorites-cell-bug-6').click();
    const toggle = page.getByTestId('favorites-type-toggle');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveText('Hide Icons');
    const [headerBox, toggleBox] = await Promise.all([
      page.getByTestId('bottom-sheet-header-frame').boundingBox(),
      toggle.boundingBox(),
    ]);
    expect(headerBox).toBeTruthy();
    expect(toggleBox).toBeTruthy();
    expect(toggleBox!.y).toBeGreaterThanOrEqual(headerBox!.y);
    expect(toggleBox!.y + toggleBox!.height).toBeLessThanOrEqual(headerBox!.y + headerBox!.height);
    await page.screenshot({ path: testInfo.outputPath('types-toggle-in-header.png') });
    await expect(page.getByTestId('favorites-type-icon').first()).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('favorites-type-icon')).toHaveCount(0);
    await expect(page.getByTestId('favorites-picker')).toBeVisible();
    await toggle.click();
    await expect(page.getByTestId('favorites-type-icon').first()).toBeVisible();
  });

  test('desktop type toggle stays in the popover header', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/favorite-pokemon-by-type');
    await page.getByTestId('favorites-cell-fire-1').click();
    const pane = page.getByTestId('favorites-picker');
    const header = pane.locator(':scope > div').first();
    const toggle = pane.getByTestId('favorites-type-toggle');
    const [headerBox, toggleBox] = await Promise.all([header.boundingBox(), toggle.boundingBox()]);
    expect(headerBox).toBeTruthy();
    expect(toggleBox).toBeTruthy();
    expect(toggleBox!.y).toBeGreaterThanOrEqual(headerBox!.y);
    expect(toggleBox!.y + toggleBox!.height).toBeLessThanOrEqual(headerBox!.y + headerBox!.height);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(pane.getByTestId('favorites-type-icon').first()).toBeVisible();
    await toggle.click();
    await expect(pane.getByTestId('favorites-type-icon')).toHaveCount(0);
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

  test('a direct relocation replaces the opened cell without showing packing', async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    await page.getByTestId('favorites-cell-fairy-2').click();
    await page.getByTestId('favorites-pick-176').click();
    await page.getByTestId('favorites-cell-water-2').click();
    await page.getByTestId('favorites-pick-184').click();
    await page.getByTestId('favorites-cell-fairy-2').click();
    await page.getByTestId('favorites-pick-184').click();
    await expect(page.getByTestId('favorites-packing')).toHaveCount(0);
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
    const map = page.getByTestId('favorites-minimap');
    await expect(map).toBeAttached();
    await page.waitForTimeout(150);
    expect(await map.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.05);
    await page.getByTestId('favorites-cell-fire-1').click();
    await page.getByTestId('favorites-pick-4').click();
    const scroller = page.getByTestId('favorites-grid-scroll');
    await expect(page.getByTestId('favorites-scroll-cue')).toBeVisible();
    await scroller.evaluate((el) => { el.scrollLeft = 200; });
    await expect(page.getByTestId('favorites-scroll-cue')).toHaveCount(0);
    await expect(map).toBeVisible();
    expect(await map.locator('[data-kind]').count()).toBe(22 * 12);
    await expect(map.locator('[data-filled="true"]')).not.toHaveCount(0);
    await expect(map.locator('[data-filled="false"]')).not.toHaveCount(0);
    const viewport = page.getByTestId('favorites-minimap-viewport');
    const colors = await viewport.evaluate((el) => {
      const sample = document.createElement('span');
      sample.style.color = 'var(--color-primary)';
      document.body.appendChild(sample);
      const primary = getComputedStyle(sample).color;
      sample.remove();
      return { outline: getComputedStyle(el).outlineColor, width: getComputedStyle(el).outlineWidth, offset: getComputedStyle(el).outlineOffset, primary };
    });
    expect(colors.outline).toBe(colors.primary);
    expect(colors.width).toBe('1px');
    expect(colors.offset).toBe('1px');
    const shades = await map.evaluate((el) => {
      const filled = el.querySelector('[data-type="fire"][data-filled="true"]');
      const empty = el.querySelector('[data-type="fire"][data-filled="false"]');
      return [getComputedStyle(filled!).backgroundColor, getComputedStyle(empty!).backgroundColor];
    });
    expect(shades[0]).not.toBe(shades[1]);
    expect(shades[1]).not.toBe('rgb(228, 228, 231)');
    const windowLeft = (await viewport.boundingBox())!.x;
    await scroller.evaluate((el) => { el.scrollLeft = 450; });
    await expect.poll(async () => (await viewport.boundingBox())?.x ?? 0).toBeGreaterThan(windowLeft + 3);
    await expect.poll(() => map.evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 4_000 }).toBeLessThan(0.05);
    await page.reload();
    await expect(page.getByTestId('favorites-scroll-cue')).toHaveCount(0);
  });

  test('desktop grid sprites stay native and mobile artwork reaches the cell edge', { tag: '@viewport' }, async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    await page.getByTestId('favorites-cell-electric-1').click();
    await page.getByTestId('favorites-pick-25').click();
    await page.getByTestId('favorites-cell-electric-5').click();
    await page.getByTestId('favorites-pick-644').click();
    const small = page.getByTestId('favorites-cell-electric-1').locator('img[data-grid-sprite-size]');
    const large = page.getByTestId('favorites-cell-electric-5').locator('img[data-grid-sprite-size]');
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      await expect(small).toHaveAttribute('data-grid-sprite-size', '96');
      await expect(large).toHaveAttribute('data-grid-sprite-size', '96');
    } else {
      await expect(small).toHaveAttribute('data-grid-sprite-size', '120');
      await expect(large).toHaveAttribute('data-grid-sprite-size', '101');
    }
  });

  test('filled sprites can paint outside the cell boundary', { tag: '@viewport' }, async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    await page.getByTestId('favorites-cell-fire-1').click();
    await page.getByTestId('favorites-pick-4').click();
    await page.getByTestId('favorites-cell-water-1').click();
    await page.getByTestId('favorites-pick-7').click();
    await page.getByTestId('favorites-cell-water-1').locator('img[alt]:not([alt=""])').evaluate((el) => {
      (el as HTMLElement).style.width = '90%';
      (el as HTMLElement).style.height = '90%';
    });
    const overflow = await page.getByTestId('favorites-cell-fire-1').evaluate((el) => {
      const style = getComputedStyle(el);
      const sprite = el.querySelector('img[alt]:not([alt=""])');
      const cellBox = el.getBoundingClientRect();
      const priorSize = sprite instanceof HTMLElement
        ? { width: sprite.style.width, height: sprite.style.height }
        : null;
      if (sprite instanceof HTMLElement) {
        sprite.style.width = '120%';
        sprite.style.height = '120%';
      }
      const spriteBox = sprite?.getBoundingClientRect();
      const paintsRight = Boolean(spriteBox && spriteBox.right > cellBox.right + 2);
      const priorPointerEvents = sprite instanceof HTMLElement ? sprite.style.pointerEvents : '';
      if (sprite instanceof HTMLElement) sprite.style.pointerEvents = 'auto';
      const hit = spriteBox && paintsRight
        ? document.elementFromPoint(cellBox.right + 2, spriteBox.top + spriteBox.height / 2)
        : null;
      if (sprite instanceof HTMLElement && priorSize) {
        sprite.style.pointerEvents = priorPointerEvents;
        sprite.style.width = priorSize.width;
        sprite.style.height = priorSize.height;
      }
      return { x: style.overflowX, y: style.overflowY, paintsRight, hitSprite: hit === sprite };
    });
    expect(overflow).toEqual({ x: 'visible', y: 'visible', paintsRight: true, hitSprite: true });
  });

  test('selector icons can be hidden in every cell', async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    await page.getByTestId('favorites-cell-fire-1').click();
    await expect(page.getByTestId('favorites-type-icon').first()).toBeVisible();
    await page.getByTestId('favorites-type-toggle').click();
    await page.keyboard.press('Escape');
    await page.getByTestId('favorites-cell-gimmick-8').click();
    await expect(page.getByTestId('favorites-type-icon')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByTestId('favorites-cell-legendary-1').click();
    await expect(page.getByTestId('favorites-type-icon')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByTestId('favorites-cell-starter-1').click();
    await expect(page.getByTestId('favorites-type-icon')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByTestId('favorites-cell-favorite-1').click();
    await expect(page.getByTestId('favorites-type-icon')).toHaveCount(0);
  });

  test('mobile selector header shows two badges and no back indicator', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/favorite-pokemon-by-type');
    await page.getByTestId('favorites-cell-fire-1').click();
    const header = page.getByTestId('bottom-sheet-header');
    await expect(header.locator('svg.lucide-chevron-left')).toHaveCount(0);
    await expect(header.locator('[class*="border-primary"]:not([data-testid="favorites-type-toggle"])')).toHaveCount(0);
    const badges = header.getByTestId('favorites-picker-title').getByRole('img');
    await expect(badges).toHaveCount(2);
    await expect(badges.nth(0)).toHaveAttribute('aria-label', 'Fire');
    await expect(badges.nth(1)).toHaveAttribute('aria-label', 'Gen I');
    await header.click();
    await expect(page.getByTestId('favorites-picker')).toBeHidden();
  });

  test('generation pointer shows its column origin on solid sprites', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/favorite-pokemon-by-type');
    await page.evaluate(() => {
      localStorage.setItem('favorite-picker', JSON.stringify({
        state: { fills: { 'starter|1': 4, 'gimmick|1': 6, 'legendary|1': 144 } },
        version: 1,
      }));
    });
    await page.reload();
    await page.getByTestId('favorites-cell-favorite-1').click();
    for (const [id, source, types] of [[4, 'starter', ['fire']], [6, 'gimmick', ['fire', 'flying']], [144, 'legendary', ['ice', 'flying']]] as const) {
      const pick = page.getByTestId(`favorites-pick-${id}`);
      await expect(pick.locator('..').locator(`[data-testid="favorites-pointer-mark"][data-source="${source}"]`)).toBeVisible();
      const typeIcons = pick.getByTestId('favorites-type-icon');
      await expect(typeIcons).toHaveCount(types.length);
      for (const [index, type] of types.entries()) {
        await expect(typeIcons.nth(index)).toHaveAttribute('data-type', type);
        await expect(typeIcons.nth(index)).toBeVisible();
      }
      await expect(pick.locator('..').getByTestId('favorites-used-mark')).toHaveCount(0);
      const opacity = await pick.locator('img[alt]').first().evaluate((el) => Number(getComputedStyle(el).opacity));
      expect(opacity).toBe(1);
    }
    await page.screenshot({ path: testInfo.outputPath('pointer-sources.png') });
  });

  test('pointer picks follow template order, show opposite-axis origin, and show toggled type icons', async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    await page.evaluate(() => localStorage.setItem('favorite-picker', JSON.stringify({
      state: { fills: {
        'fighting|6': 701,
        'starter|6': 650,
        'gimmick|6': 10300,
        'legendary|6': 716,
        'fire|1': 4,
        'fire|2': 155,
      } }, version: 1,
    })));
    await page.reload();
    await page.getByTestId('favorites-cell-favorite-6').click();
    const rowIds = await page.getByTestId('favorites-pretty-grid').locator('[data-testid^="favorites-pick-"]').evaluateAll(
      (els) => els.map((el) => Number(el.getAttribute('data-testid')!.replace('favorites-pick-', ''))),
    );
    expect(rowIds).toEqual([701, 650, 716, 10300]);
    await expect(page.getByTestId('favorites-origin-tile-701').locator('[data-source="type"]')).toBeVisible();
    await expect(page.getByTestId('favorites-origin-tile-10300').locator('[data-source="gimmick"]')).toBeVisible();
    await expect(page.getByTestId('favorites-type-icon').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('favorites-cell-fire-favorite').click();
    const colIds = await page.getByTestId('favorites-pretty-grid').locator('[data-testid^="favorites-pick-"]').evaluateAll(
      (els) => els.map((el) => Number(el.getAttribute('data-testid')!.replace('favorites-pick-', ''))),
    );
    expect(colIds).toEqual([4, 155]);
    await expect(page.getByTestId('favorites-origin-tile-4').locator('[data-source="gen"]')).toBeVisible();
    await expect(page.getByTestId('favorites-type-icon').first()).toBeVisible();
  });

  test('selection and clear outlines stay inside their tiles and the clear x paints above source badges', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/favorite-pokemon-by-type');
    await page.evaluate(() => {
      localStorage.setItem('favorite-picker', JSON.stringify({
        state: { fills: { 'starter|1': 4, 'gimmick|1': 6, 'legendary|1': 144, 'favorite|1': 6 } },
        version: 1,
      }));
    });
    await page.reload();
    await page.getByTestId('favorites-cell-favorite-1').click();
    const selected = page.getByTestId('favorites-pick-6');
    const ring = selected.getByTestId('favorites-selection-ring');
    const clear = page.getByTestId('favorites-clear');
    const boxes = await Promise.all([selected.boundingBox(), ring.boundingBox(), clear.boundingBox(), page.getByTestId('favorites-pick-4').boundingBox(), selected.locator('..').getByTestId('favorites-pointer-mark').boundingBox()]);
    expect(boxes.every(Boolean)).toBe(true);
    expect(boxes[1]!.x).toBeGreaterThan(boxes[0]!.x);
    expect(boxes[1]!.x + boxes[1]!.width).toBeLessThan(boxes[0]!.x + boxes[0]!.width);
    expect(boxes[2]!.x).toBeGreaterThanOrEqual(boxes[0]!.x);
    expect(boxes[2]!.x + boxes[2]!.width).toBeLessThanOrEqual(boxes[0]!.x + boxes[0]!.width);
    expect(boxes[3]!.x + boxes[3]!.width).toBeLessThanOrEqual(boxes[1]!.x);
    expect(boxes[4]!.x + boxes[4]!.width).toBeLessThanOrEqual(boxes[0]!.x + boxes[0]!.width);
    await expect(selected.locator('..').getByTestId('favorites-pointer-mark')).toHaveAttribute('data-source', 'gimmick');
    const layers = await selected.evaluate((el) => ({
      badge: Number(getComputedStyle(el.parentElement!.querySelector('[data-testid="favorites-pointer-mark"]')!.parentElement!).zIndex),
      ring: Number(getComputedStyle(el.querySelector('[data-testid="favorites-selection-ring"]')!).zIndex),
      clear: Number(getComputedStyle(el.querySelector('[data-testid="favorites-clear"]')!).zIndex),
      sprite: Number(getComputedStyle(el.querySelector('img[alt]:not([alt=""])')!).zIndex),
    }));
    expect(layers.badge).toBeGreaterThan(layers.ring);
    expect(layers.clear).toBeGreaterThan(layers.badge);
    expect(layers.sprite).toBeGreaterThan(layers.ring);
    await page.screenshot({ path: testInfo.outputPath('picker-rings.png') });
  });

  test('overall favorite includes both category favorites and the legendary favorite', async ({ page }) => {
    await page.goto('/favorite-pokemon-by-type');
    await page.evaluate(() => {
      localStorage.setItem('favorite-picker', JSON.stringify({
        state: { fills: {
          'fire|1': 4,
          'fire|favorite': 4,
          'favorite|1': 4,
          'starter|1': 1,
          'starter|favorite': 1,
          'gimmick|1': 6,
          'gimmick|favorite': 6,
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
    await expect(both.locator('..').locator('[data-testid="favorites-pointer-mark"][data-source="gen"]')).toBeVisible();
    await expect(both.locator('..').locator('[data-testid="favorites-pointer-mark"][data-source="type"]')).toBeVisible();
    const legendary = page.getByTestId('favorites-pick-144');
    await expect(legendary).toBeVisible();
    await expect(legendary.locator('..').locator('[data-testid="favorites-pointer-mark"][data-source="legendary"]')).toBeVisible();
    await expect(page.getByTestId('favorites-origin-tile-1').locator('[data-source="starter"]')).toBeVisible();
    await expect(page.getByTestId('favorites-origin-tile-6').locator('[data-source="gimmick"]')).toBeVisible();
    const order = await page.getByTestId('favorites-pretty-grid').locator('[data-testid^="favorites-pick-"]').evaluateAll(
      (items) => items.map((item) => Number(item.getAttribute('data-testid')!.replace('favorites-pick-', ''))),
    );
    expect(order).toEqual([4, 1, 6, 144]);
    const opacity = await both.locator('img').first().evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(opacity).toBe(1);
  });

  test('overall legendary pointer badges omit the implied category and stay within their tile', { tag: '@viewport' }, async ({ page }, testInfo) => {
    await page.goto('/favorite-pokemon-by-type');
    await page.evaluate(() => {
      localStorage.setItem('favorite-picker', JSON.stringify({
        state: { fills: {
          'legendary|5': 643,
          'fire|legendary': 643,
          'dragon|legendary': 643,
        } },
        version: 1,
      }));
    });
    await page.reload();
    await page.getByTestId('favorites-cell-legendary-legendary').click();
    const marks = page.getByTestId('favorites-origin-tile-643').getByTestId('favorites-pointer-mark');
    await expect(marks).toHaveCount(3);
    await expect(marks.nth(0)).toHaveAttribute('data-source', 'gen');
    await expect(marks.nth(1)).toHaveAttribute('data-source', 'type');
    await expect(marks.nth(2)).toHaveAttribute('data-source', 'type');
    const boxes = await marks.evaluateAll((items) => items.map((item) => {
      const { top, height } = item.getBoundingClientRect();
      return { top, height };
    }));
    expect(boxes[1].top + boxes[1].height / 2).toBeCloseTo(boxes[0].top + boxes[0].height / 2, 1);
    expect(boxes[2].top + boxes[2].height / 2).toBeCloseTo(boxes[1].top + boxes[1].height / 2, 1);
    await expect(marks.nth(0)).toHaveAttribute('data-coordinate-cell', 'legendary|5');
    await expect(marks.nth(1)).toHaveAttribute('data-coordinate-cell', 'fire|legendary');
    await expect(marks.nth(2)).toHaveAttribute('data-coordinate-cell', 'dragon|legendary');
    for (const mark of await marks.all()) {
      await expect(mark).toHaveAttribute('data-origin-mode', 'single');
      await expect(mark.locator('img')).toHaveCount(1);
    }
    const contained = await marks.evaluateAll((items) => items.every((item) => {
      const tile = item.closest('[data-selector-tile]')!.getBoundingClientRect();
      const box = item.getBoundingClientRect();
      return box.left >= tile.left && box.right <= tile.right && box.top >= tile.top && box.bottom <= tile.bottom;
    }));
    expect(contained).toBe(true);
    const circleAreaRatio = await marks.first().evaluate((el) => {
      const box = el.getBoundingClientRect();
      const svg = new DOMParser().parseFromString(decodeURIComponent(el.querySelector('img')!.src.split(',')[1]), 'image/svg+xml');
      const radius = Number(svg.querySelector('circle')!.getAttribute('r'));
      const viewBoxWidth = Number(svg.documentElement.getAttribute('viewBox')!.split(' ')[2]);
      const square = el.nextElementSibling!;
      const squareSide = square.getBoundingClientRect().height;
      const cornerRadius = parseFloat(getComputedStyle(square).borderRadius);
      const squareArea = squareSide ** 2 - (4 - Math.PI) * cornerRadius ** 2;
      return Math.PI * (radius * box.width / viewBoxWidth) ** 2 / squareArea;
    });
    expect(circleAreaRatio).toBeCloseTo(1, 2);
    expect(await marks.first().evaluate((el) => getComputedStyle(el.parentElement!).opacity)).toBe('0.85');
    const numeral = await marks.first().locator('img').first().evaluate((img) => decodeURIComponent((img as HTMLImageElement).src));
    expect(numeral).toContain('<circle');
    expect(numeral).toContain('stroke-linejoin="round"');
    await page.getByTestId('favorites-pretty-grid').screenshot({ path: testInfo.outputPath('legendary-origins.png') });
  });

  test('Gen 8 wolves have base and Crowned picks while Ogerpon keeps only matching pixel forms', async ({ page }, testInfo) => {
    await page.goto('/favorite-pokemon-by-type');
    await page.getByTestId('favorites-cell-legendary-8').click();
    for (const id of [888, 10188, 889, 10189]) {
      const pick = page.getByTestId(`favorites-pick-${id}`);
      await expect(pick).toBeVisible();
      await expect.poll(() => pick.locator('img[alt]:not([alt=""])').evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }
    const order = await page.getByTestId('favorites-pretty-grid').locator('[data-testid^="favorites-pick-"]').evaluateAll(
      (els) => els.map((el) => Number(el.getAttribute('data-testid')!.replace('favorites-pick-', ''))),
    );
    expect(order[order.indexOf(888) + 1]).toBe(10188);
    expect(order[order.indexOf(889) + 1]).toBe(10189);
    expect(order.indexOf(10246)).toBeGreaterThan(order.indexOf(892));
    await page.getByTestId('favorites-pretty-grid').screenshot({ path: testInfo.outputPath('base-and-crowned-wolves.png') });
    await page.keyboard.press('Escape');

    await page.getByTestId('favorites-cell-grass-9').click();
    for (const id of [1017, 10273, 10274, 10275]) {
      await expect(page.getByTestId(`favorites-pick-${id}`)).toBeVisible();
    }
    for (const id of [11014, 11015, 11016, 11017]) {
      await expect(page.getByTestId(`favorites-pick-${id}`)).toHaveCount(0);
    }
    await page.screenshot({ path: testInfo.outputPath('ogerpon-pixel-forms.png') });
  });
  test('a pick on the same row shows taken with its column mark in the Gen 8 gimmick selector', async ({ page }, testInfo) => {
    await seedFills(page, { 'steel|8': 10242 });
    await page.getByTestId('favorites-cell-gimmick-8').click();
    const taken = await takenState(page, [10242]);
    expect(taken).toEqual({ 10242: { faded: false, marks: ['type:steel'] } });
    await testInfo.attach('gen8-gimmick-taken.json', { body: JSON.stringify(taken, null, 2), contentType: 'application/json' });
  });

  test('the legendary row and column share taken marks, shown with the other coordinate', async ({ page }, testInfo) => {
    await seedFills(page, { 'legendary|2': 249 });
    await page.getByTestId('favorites-cell-psychic-legendary').click();
    const fromRow = await takenState(page, [249]);
    expect(fromRow).toEqual({ 249: { faded: false, marks: ['gen:2'] } });
    await seedFills(page, { 'psychic|legendary': 249 });
    await page.getByTestId('favorites-cell-legendary-2').click();
    const fromColumn = await takenState(page, [249]);
    expect(fromColumn).toEqual({ 249: { faded: false, marks: ['type:psychic'] } });
    await testInfo.attach('legendary-line-taken.json', { body: JSON.stringify({ fromRow, fromColumn }, null, 2), contentType: 'application/json' });
  });

  test('the normal gimmick selector marks picks across the grid without changing their sources', async ({ page }, testInfo) => {
    await seedFills(page, { 'dark|8': 10174, 'dark|7': 10092, 'ghost|8': 10239, 'gimmick|1': 10039, 'gimmick|4': 10308 });
    await page.getByTestId('favorites-cell-normal-gimmick').click();
    const taken = await takenState(page, [10174, 10092, 10239, 10039, 10308]);
    expect(taken).toEqual({
      10174: { faded: false, marks: ['gen:8'] },
      10092: { faded: false, marks: ['gen:7'] },
      10239: { faded: false, marks: ['gen:8'] },
      10039: { faded: false, marks: ['gen:1'] },
      10308: { faded: false, marks: ['gen:4'] },
    });
    await testInfo.attach('normal-gimmick-taken.json', { body: JSON.stringify(taken, null, 2), contentType: 'application/json' });
  });

  test('repeat picks preserve independent sources and pointers despite an old saved setting @viewport', async ({ page }, testInfo) => {
    await page.addInitScript(() => localStorage.setItem('personal-151-favorites-no-repeats-v1', '1'));
    await seedFills(page, { 'grass|1': 1, 'favorite|1': 1 });
    await expect(page.getByTestId('favorites-settings-open')).toHaveCount(0);
    await page.getByTestId('favorites-cell-poison-1').click();
    const repeated = page.getByTestId('favorites-pick-1');
    await expect(repeated.locator('img[alt="Bulbasaur"]')).toHaveCSS('opacity', '1');
    await repeated.click();
    const repeatedFills = await savedFills(page);
    expect(repeatedFills).toEqual({ 'grass|1': 1, 'poison|1': 1, 'favorite|1': 1 });
    await page.reload();
    expect(await savedFills(page)).toEqual(repeatedFills);
    // Remove one source: the pointer remains valid through the other source.
    await page.getByTestId('favorites-cell-grass-1').click();
    await page.getByTestId('favorites-pick-1').click();
    expect(await savedFills(page)).toEqual({ 'poison|1': 1, 'favorite|1': 1 });
    // Remove the final source: ordinary pointer pruning still applies.
    await page.getByTestId('favorites-cell-poison-1').click();
    await page.getByTestId('favorites-pick-1').click();
    expect(await savedFills(page)).toEqual({});
    await testInfo.attach('repeat-picks.json', { body: JSON.stringify({ repeatedFills, afterClearingSources: await savedFills(page) }, null, 2), contentType: 'application/json' });
  });
});
