import { expect, test, type Locator, type Page } from '@playwright/test';
import { SHINY_STAR } from '../src/components/shiny/shinyMarks';

const SHINY = /\/sprites\/pokemon\/shiny\/\d+\.png$/;
const sprite = (tile: Locator) => tile.locator('img[alt]:not([alt=""])');

async function seed(page: Page, state: object) {
  await page.addInitScript((saved) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('favorite-picker', JSON.stringify({ state: saved, version: 4 }));
    sessionStorage.setItem('seeded', '1');
  }, state);
}

const hexRgb = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
/** The shiny star's fill runs between these two colors. */
const STAR_FILL = SHINY_STAR.fill.stops.map(([, color]) => hexRgb(color));

/** Counts the export preview's pixels in a box that lie on the shiny star's fill gradient. */
async function exportStarPixels(page: Page, [x, y, width, height]: [number, number, number, number]) {
  return page.locator('[data-export-preview-layer] img[src^="blob:"]').evaluate(async (el, { box, fill: [from, to] }) => {
    const img = el as HTMLImageElement;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(box[0], box[1], box[2], box[3]);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const t = (from[1] - data[i + 1]) / (from[1] - to[1]);
      if (t < 0 || t > 1) continue;
      if (Math.abs(data[i] - (from[0] + (to[0] - from[0]) * t)) <= 4 && Math.abs(data[i + 2] - (from[2] + (to[2] - from[2]) * t)) <= 6) count++;
    }
    return count;
  }, { box: [x, y, width, height], fill: STAR_FILL });
}

/** Reads a PNG from the export preview and returns the RGBA at each point. */
async function exportPixels(page: Page, points: Record<string, [number, number]>) {
  return page.locator('[data-export-preview-layer] img[src^="blob:"]').evaluate(async (el, wanted) => {
    const img = el as HTMLImageElement;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return Object.fromEntries(Object.entries(wanted).map(([name, [x, y]]) => [name, [...ctx.getImageData(x, y, 1, 1).data]]));
  }, points);
}

test('a pick made with Shiny on is shiny in the sheet, the chart, its pointers, and both exports', async ({ page }, testInfo) => {
  const shinyRequests: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/sprites/pokemon/shiny/')) shinyRequests.push(request.url()); });
  await seed(page, { fills: {} });
  await page.goto('/favorite-pokemon-picker?lang=en');

  await page.getByTestId('favorites-cell-fire-1').click();
  const toggle = page.getByTestId('favorites-shiny-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toHaveText('Shiny');
  await expect(sprite(page.getByTestId('favorites-pick-6'))).not.toHaveAttribute('src', SHINY);
  expect(shinyRequests).toEqual([]);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(sprite(page.getByTestId('favorites-pick-6'))).toHaveAttribute('src', /\/sprites\/pokemon\/shiny\/6\.png$/);
  await page.getByTestId('favorites-pick-6').click();
  const fire = page.getByTestId('favorites-cell-fire-1');
  await expect(fire.locator('img[data-grid-sprite-size]')).toHaveAttribute('src', /\/sprites\/pokemon\/shiny\/6\.png$/);
  await expect(fire.getByTestId('shiny-star')).toBeVisible();
  await expect(fire).toHaveAttribute('aria-label', /Charizard · Shiny$/);

  await page.getByTestId('favorites-cell-normal-6').click();
  const furfrou = page.getByTestId('favorites-pick-11096');
  await expect(furfrou.getByTestId('no-shiny-mark')).toBeVisible();
  await expect(sprite(furfrou)).not.toHaveAttribute('src', SHINY);
  await expect(sprite(furfrou)).toHaveCSS('filter', 'grayscale(1)');
  await expect(sprite(page.getByTestId('favorites-pick-659'))).toHaveAttribute('src', SHINY);
  await testInfo.attach('no-shiny-sheet.png', { body: await page.screenshot(), contentType: 'image/png' });
  await furfrou.click();
  const normal = page.getByTestId('favorites-cell-normal-6');
  await expect(normal.locator('img[data-grid-sprite-size]')).not.toHaveAttribute('src', SHINY);
  await expect(normal.getByTestId('shiny-star')).toHaveCount(0);

  await page.getByTestId('favorites-cell-favorite-1').click();
  await expect(page.getByTestId('favorites-shiny-toggle')).toHaveCount(0);
  await expect(sprite(page.getByTestId('favorites-pick-6'))).toHaveAttribute('src', /\/sprites\/pokemon\/shiny\/6\.png$/);
  await page.getByTestId('favorites-pick-6').click();
  await expect(page.getByTestId('favorites-cell-favorite-1').getByTestId('shiny-star')).toBeVisible();

  await page.getByTestId('favorites-cell-fire-1').click();
  await page.getByTestId('favorites-shiny-toggle').click();
  const converted = page.getByTestId('favorites-pick-6');
  await expect(converted.getByTestId('favorites-selection-ring')).toBeVisible();
  await expect(converted.getByTestId('favorites-clear')).toHaveCount(0);
  await expect(sprite(converted)).not.toHaveAttribute('src', SHINY);
  await converted.click();
  await expect(fire.getByTestId('shiny-star')).toHaveCount(0);
  await expect(page.getByTestId('favorites-cell-favorite-1').getByTestId('shiny-star')).toHaveCount(0);

  await page.getByTestId('favorites-cell-fire-1').click();
  await page.getByTestId('favorites-shiny-toggle').click();
  await page.getByTestId('favorites-pick-6').click();
  await expect(fire.getByTestId('shiny-star')).toBeVisible();
  await page.reload();
  await expect(fire.getByTestId('shiny-star')).toBeVisible();
  await page.getByTestId('favorites-cell-fire-1').click();
  await expect(page.getByTestId('favorites-shiny-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await testInfo.attach('chart.png', { body: await page.screenshot(), contentType: 'image/png' });

  await page.getByTestId('favorites-export-open').click();
  await expect(page.getByTestId('favorites-export-save')).toBeEnabled({ timeout: 30000 });
  // Fire / Gen I is the cell at (276, 236), 120 px square. The star sits at its top-right.
  const { body } = await exportPixels(page, { body: [328, 316] });
  const full = { body, star: await exportStarPixels(page, [336, 236, 60, 60]) };
  const shinyBody = await page.evaluate(async () => {
    const img = new Image(); img.src = '/sprites/pokemon/shiny/6.png'; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 96;
    const ctx = canvas.getContext('2d')!; ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0, 96, 96);
    return [...ctx.getImageData(328 - 288, 316 - 248, 1, 1).data];
  });
  await page.locator('[data-favorites-export-mode=simplified]').click();
  await expect(page.getByTestId('favorites-export-save')).toBeEnabled({ timeout: 30000 });
  // The Gen I favorite tile is 128 px wide at (54, 104); the star sits at its top-right.
  const simplified = { star: await exportStarPixels(page, [118, 104, 64, 64]) };
  await testInfo.attach('shiny-export-pixels.json', {
    body: JSON.stringify({ full, shinyBody, simplified }, null, 2),
    contentType: 'application/json',
  });
  expect(full.star).toBeGreaterThan(90);
  expect(full.body).toEqual(shinyBody);
  expect(simplified.star).toBeGreaterThan(90);
});

test('the sheet header keeps the title badges at full height and drops the pill labels only when tight @viewport', async ({ page }, testInfo) => {
  await seed(page, { fills: {} });
  await page.goto('/favorite-pokemon-picker?lang=en');
  await page.getByTestId('favorites-cell-fire-1').click();
  const toggle = page.getByTestId('favorites-shiny-toggle');
  const slash = toggle.locator('path[d="m2 2 20 20"]');
  await expect(slash).toHaveCount(1);
  await toggle.click();
  await expect(slash).toHaveCount(0);
  const header = await page.evaluate(() => {
    const box = (selector: string) => {
      const rect = document.querySelector(selector)!.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height };
    };
    const labelWidth = (selector: string) => document.querySelector(`${selector} span`)!.getBoundingClientRect().width;
    return {
      title: box('[data-testid="favorites-picker-title"]'),
      badge: box('[data-testid="favorites-picker-title"] > *'),
      shiny: box('[data-testid="favorites-shiny-toggle"]'),
      icons: box('[data-testid="favorites-type-toggle"]'),
      labels: [labelWidth('[data-testid="favorites-shiny-toggle"]'), labelWidth('[data-testid="favorites-type-toggle"]')],
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  await testInfo.attach('sheet-header.png', { body: await page.screenshot(), contentType: 'image/png' });
  await testInfo.attach('sheet-header.json', { body: JSON.stringify(header, null, 2), contentType: 'application/json' });
  await expect(toggle).toHaveAccessibleName('Shiny');
  await expect(page.getByTestId('favorites-type-toggle')).toHaveAccessibleName('Icons');
  expect(header.badge.height).toBeCloseTo(22, 1);
  expect(header.shiny.height).toBeCloseTo(header.badge.height, 1);
  expect(header.icons.height).toBeCloseTo(header.badge.height, 1);
  // A 320 px phone has no room for the labels; wider screens show them.
  const labelled = testInfo.project.name !== 'narrow';
  for (const width of header.labels) expect(width > 1).toBe(labelled);
  expect(header.title.right).toBeLessThanOrEqual(header.shiny.left);
  expect(header.shiny.right).toBeLessThan(header.icons.left);
  expect(header.icons.right).toBeLessThanOrEqual(header.viewport);
  expect(header.scrollWidth).toBeLessThanOrEqual(header.viewport);
});
