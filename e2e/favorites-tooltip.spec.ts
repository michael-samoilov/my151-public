import { expect, test, type Locator, type Page } from '@playwright/test';

const FILLS = { 'fire|1': 6, 'water|1': 9 };

async function openSeeded(page: Page) {
  await page.addInitScript((value) => {
    if (sessionStorage.getItem('favorites-tooltip-seeded')) return;
    localStorage.setItem('favorite-picker', value);
    sessionStorage.setItem('favorites-tooltip-seeded', '1');
  }, JSON.stringify({ state: { fills: FILLS }, version: 1 }));
  await page.goto('/favorite-pokemon-by-type');
}

async function center(locator: Locator) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function savedFill(page: Page, key: string) {
  return page.evaluate((cell) => JSON.parse(localStorage.getItem('favorite-picker')!).state.fills[cell], key);
}

test.describe('favorite picker name tooltip', () => {
  test('names a hovered grid sprite and selector sprite in a dark tip outside the grid', async ({ page }, testInfo) => {
    await openSeeded(page);
    const name = page.getByRole('tooltip');
    const tip = page.getByTestId('favorites-name-tooltip');

    await page.getByTestId('favorites-cell-fire-1').hover();
    await expect(name).toHaveText('Charizard');
    const gridTip = await tip.evaluate((el) => {
      const [r, g, b] = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)!.map(Number);
      return {
        luminance: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255,
        inGridFrame: Boolean(el.closest('[data-testid="favorites-grid-scroll"]')),
      };
    });
    expect(gridTip.luminance).toBeLessThan(0.3);
    expect(gridTip.inGridFrame).toBe(false);

    // An empty cell has no name to show.
    await page.getByTestId('favorites-cell-normal-1').hover();
    await expect(tip).toHaveCount(0);

    await page.getByTestId('favorites-cell-water-1').click();
    const tile = page.getByTestId('favorites-pick-7');
    await tile.hover();
    await expect(name).toHaveText((await tile.getAttribute('aria-label'))!);
    const inPicker = await tip.evaluate((el) => Boolean(el.closest('[data-testid="favorites-picker"]')));
    expect(inPicker).toBe(false);

    await testInfo.attach('tooltip-selector.png', { body: await page.screenshot(), contentType: 'image/png' });
    await testInfo.attach('tooltip.json', {
      body: JSON.stringify({ grid: 'Charizard', selector: await tile.getAttribute('aria-label'), gridTip, inPicker }),
      contentType: 'application/json',
    });
  });

  test('a tip never swallows a click on the tile under it', async ({ page }, testInfo) => {
    await openSeeded(page);
    await page.getByTestId('favorites-cell-water-1').click();
    const below = page.getByTestId('favorites-pick-61');
    const above = page.getByTestId('favorites-pick-7');
    await below.hover();
    const tip = page.getByTestId('favorites-name-tooltip');
    await expect(tip).toBeVisible();
    // The tip opens above the hovered tile, over the tile in the row above.
    // Move to a point the tip covers, the way a mouse would, and click there.
    const target = await center(tip);
    const aboveBox = (await above.boundingBox())!;
    expect(target.y).toBeGreaterThan(aboveBox.y);
    expect(target.y).toBeLessThan(aboveBox.y + aboveBox.height);
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(() => savedFill(page, 'water|1')).toBe(7);

    await testInfo.attach('click-through.json', {
      body: JSON.stringify({ clickPoint: target, aboveTile: aboveBox, saved: await savedFill(page, 'water|1') }),
      contentType: 'application/json',
    });
  });
});

test.describe('favorite picker name tooltip on touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

  test('a tap on a filled cell and a selector sprite shows no tip', async ({ page }, testInfo) => {
    await openSeeded(page);
    await page.getByTestId('favorites-cell-water-1').tap();
    await expect(page.getByTestId('favorites-picker')).toBeVisible();
    // Wait past the 200 ms open delay.
    await page.waitForTimeout(500);
    await expect(page.getByTestId('favorites-name-tooltip')).toHaveCount(0);

    await page.getByTestId('favorites-pick-7').tap();
    await expect.poll(() => savedFill(page, 'water|1')).toBe(7);
    await page.waitForTimeout(500);
    await expect(page.getByTestId('favorites-name-tooltip')).toHaveCount(0);

    await testInfo.attach('touch-no-tooltip.png', { body: await page.screenshot(), contentType: 'image/png' });
  });
});

/**
 * Real finger input through CDP. It runs in every project, so it covers the
 * phone sheet and the desktop pane on a touch screen.
 */
test.describe('favorite picker name tooltip on a held finger', { tag: '@viewport' }, () => {
  test('a held finger names a sprite until it lifts, and that release never picks, opens, or clears', async ({ page }, testInfo) => {
    await openSeeded(page);
    const cdp = await page.context().newCDPSession(page);
    const tip = page.getByTestId('favorites-name-tooltip');
    const picker = page.getByTestId('favorites-picker');
    const touch = (type: 'touchStart' | 'touchMove', points: { x: number; y: number }[]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ ...p, id: i + 1 })) });
    const lift = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const tap = async (testId: string) => {
      await touch('touchStart', [await center(page.getByTestId(testId))]);
      await lift();
    };
    /** Holds a finger on the tile past the 450 ms hold, reads the tip, then lifts. */
    const hold = async (testId: string) => {
      await touch('touchStart', [await center(page.getByTestId(testId))]);
      await page.waitForTimeout(700);
      const [held = null] = await page.getByRole('tooltip').allTextContents();
      await lift();
      await expect(tip).toHaveCount(0);
      // Wait past the click that can follow a hold.
      await page.waitForTimeout(300);
      return held;
    };
    /** Slides a finger 30 px left from the tile, waits past the hold, and counts tips. */
    const slide = async (testId: string) => {
      const from = await center(page.getByTestId(testId));
      await touch('touchStart', [from]);
      for (let step = 1; step <= 3; step++) await touch('touchMove', [{ x: from.x - 10 * step, y: from.y }]);
      await page.waitForTimeout(700);
      const tips = await tip.count();
      await lift();
      return tips;
    };

    const grid = await hold('favorites-cell-fire-1');
    const pickerAfterGridHold = await picker.count();

    await tap('favorites-cell-water-1');
    await expect(picker).toBeVisible();
    const selector = await hold('favorites-pick-7');
    const afterSelectorHold = { saved: await savedFill(page, 'water|1'), pickerOpen: await picker.isVisible() };
    await tap('favorites-pick-7');
    await expect.poll(() => savedFill(page, 'water|1')).toBe(7);
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);

    // Squirtle now carries the clear x. A hold on it does not clear it.
    await tap('favorites-cell-water-1');
    await expect(picker).toBeVisible();
    await hold('favorites-pick-7');
    const afterClearHold = await savedFill(page, 'water|1');
    // A finger that slides across the selector drops the hold, even where
    // nothing scrolls.
    const tipAfterSlide = await slide('favorites-pick-7');
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);

    // A second finger, or a finger that scrolls the grid, drops the hold. The
    // scroll comes last, because it moves the cells.
    const start = await center(page.getByTestId('favorites-cell-fire-1'));
    await touch('touchStart', [start]);
    await touch('touchStart', [start, { x: start.x, y: start.y + 60 }]);
    await page.waitForTimeout(700);
    const tipAfterSecondFinger = await tip.count();
    await lift();
    const tipAfterScroll = await slide('favorites-cell-fire-1');
    await page.waitForTimeout(300);
    await cdp.detach();

    const result = {
      grid,
      pickerAfterGridHold,
      selector,
      afterSelectorHold,
      afterClearHold,
      tipAfterSlide,
      tipAfterSecondFinger,
      tipAfterScroll,
      pickerAfterGestures: await picker.count(),
    };
    await testInfo.attach('long-press.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    expect(result).toEqual({
      grid: 'Charizard',
      pickerAfterGridHold: 0,
      selector: 'Squirtle',
      afterSelectorHold: { saved: 9, pickerOpen: true },
      afterClearHold: 7,
      tipAfterSlide: 0,
      tipAfterSecondFinger: 0,
      tipAfterScroll: 0,
      pickerAfterGestures: 0,
    });
  });
});
