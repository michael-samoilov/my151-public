import { expect, test } from '@playwright/test';

test('desktop grid keeps native sprites, aligned rows, and a larger minimap', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop table geometry');
  await page.goto('/favorite-pokemon-picker');
  await page.screenshot({ path: testInfo.outputPath('desktop-grid.png') });

  const scroll = page.getByTestId('favorites-grid-scroll');
  const grid = page.getByTestId('favorites-grid');
  const firstCell = page.getByTestId('favorites-cell-normal-1');
  const firstHeader = page.locator('div[data-row-banded]').first();
  const lastCell = page.getByTestId('favorites-cell-normal-favorite');
  const lastHeader = page.locator('div[data-row-banded]').last();
  await scroll.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  const [first, firstH, last, lastH] = await Promise.all([
    firstCell.boundingBox(), firstHeader.boundingBox(), lastCell.boundingBox(), lastHeader.boundingBox(),
  ]);
  expect(first).toBeTruthy();
  expect(first!.width).toBeCloseTo(96, 0);
  expect(first!.height).toBeCloseTo(96, 0);
  expect(Math.abs(first!.y - firstH!.y)).toBeLessThan(1);
  expect(Math.abs(last!.y - lastH!.y)).toBeLessThan(1);
  expect(Math.abs(last!.height - lastH!.height)).toBeLessThan(1);
  await scroll.evaluate((el) => { el.scrollTop = 0; });

  // The grid scrolls inside a frame that fills the screen below the headers.
  const frame = (await scroll.boundingBox())!;
  expect(frame.y + frame.height).toBeLessThanOrEqual(800);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(800);
  const footer = page.getByText(/Nintendo/);
  expect((await footer.boundingBox())!.y).toBeGreaterThanOrEqual(800);
  const widthBefore = (await grid.boundingBox())!.width;
  await page.getByTestId('favorites-cell-electric-5').click();
  expect((await grid.boundingBox())!.width).toBeCloseTo(widthBefore, 0);
  await page.getByTestId('favorites-pick-644').click();
  const sprite = page.getByTestId('favorites-cell-electric-5').locator('img[data-grid-sprite-size]');
  // The sprite may draw from a pack's object URL (src/favorites/model/spritePreload.ts).
  await expect(sprite).toHaveAttribute('alt', 'Zekrom');
  await expect.poll(() => sprite.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(96);
  expect((await sprite.boundingBox())!.width).toBeCloseTo(96, 0);
  expect((await sprite.boundingBox())!.height).toBeCloseTo(96, 0);
  await page.screenshot({ path: testInfo.outputPath('desktop-grid-native-sprite.png') });

  await scroll.evaluate((el) => { el.scrollLeft = 300; el.scrollTop = 200; });
  const minimap = page.getByTestId('favorites-minimap');
  await expect(minimap).toBeVisible();
  expect((await minimap.boundingBox())!.width).toBeGreaterThanOrEqual(140);
});

test('neighboring desktop sprites stay at native size without overlapping', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop sprite geometry');
  await page.addInitScript(() => {
    localStorage.setItem('favorite-picker', JSON.stringify({
      state: { fills: {
        'normal|1': 143,
        'fire|1': 6,
        'water|1': 9,
        'grass|1': 3,
        'electric|1': 25,
      } },
      version: 3,
    }));
  });
  await page.goto('/favorite-pokemon-picker');
  const cells = ['normal', 'fire', 'water', 'grass', 'electric'];
  for (const type of cells) {
    await expect(page.getByTestId(`favorites-cell-${type}-1`).locator('img[data-grid-sprite-size]')).toBeAttached();
  }
  const boxes = await page.evaluate((types) => types.map((type) => {
    const cell = document.querySelector(`[data-testid="favorites-cell-${type}-1"]`)!;
    const sprite = cell.querySelector('img[data-grid-sprite-size]')!;
    const cellBox = cell.getBoundingClientRect();
    const spriteBox = sprite.getBoundingClientRect();
    return {
      x: spriteBox.x,
      y: spriteBox.y,
      width: spriteBox.width,
      height: spriteBox.height,
      centerDelta: Math.abs(spriteBox.x + spriteBox.width / 2 - (cellBox.x + cellBox.width / 2)),
    };
  }), cells);
  for (const box of boxes) {
    expect(box.width).toBeCloseTo(96, 0);
    expect(box.centerDelta).toBeLessThan(1);
  }
  boxes.sort((a, b) => a.x - b.x);
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i - 1].x + boxes[i - 1].width).toBeLessThanOrEqual(boxes[i].x + 1);
  }
  await page.screenshot({ path: testInfo.outputPath('desktop-grid-filled.png') });
});
