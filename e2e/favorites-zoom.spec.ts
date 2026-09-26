import { expect, test, type Page, type TestInfo } from '@playwright/test';

/**
 * Pinch zoom on the favorite picker grid, driven with real input: two-finger
 * CDP touches on touch projects and a synthesized touchpad pinch elsewhere.
 * Every measurement is taken on screen, through the visual viewport, so it
 * holds whether the grid or the whole page zooms.
 */

type Box = { left: number; top: number; right: number; bottom: number };

const nextFrame = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

async function pinchGrid(page: Page, testInfo: TestInfo, factor: number) {
  const frame = (await page.getByTestId('favorites-grid-scroll').boundingBox())!;
  const viewport = page.viewportSize()!;
  const x = frame.x + frame.width / 2;
  const y = (Math.max(frame.y, 0) + Math.min(frame.y + frame.height, viewport.height)) / 2;
  const cdp = await page.context().newCDPSession(page);
  if (testInfo.project.use.hasTouch) {
    const fingers = (spread: number) => [{ x: x - spread / 2, y, id: 1 }, { x: x + spread / 2, y, id: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(80) });
    for (let step = 1; step <= 16; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(80 + 80 * (factor - 1) * step / 16) });
      await nextFrame(page);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await cdp.send('Input.synthesizePinchGesture', { x, y, scaleFactor: factor, relativeSpeed: 800, gestureSourceType: 'mouse' });
  }
  await cdp.detach();
  await page.waitForTimeout(200);
}

/** Scroll toward the bottom-right the way the device would: finger drags or wheel. */
async function scrollGrid(page: Page, testInfo: TestInfo, times: number) {
  const frame = (await page.getByTestId('favorites-grid-scroll').boundingBox())!;
  const viewport = page.viewportSize()!;
  const right = Math.min(frame.x + frame.width, viewport.width) - 20;
  const bottom = Math.min(frame.y + frame.height, viewport.height) - 20;
  const cdp = await page.context().newCDPSession(page);
  for (let i = 0; i < times; i++) {
    if (testInfo.project.use.hasTouch) {
      const at = (t: number) => [{ x: right - (right - frame.x - 20) * t, y: bottom - (bottom - Math.max(frame.y, 0) - 20) * t, id: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
      for (let step = 1; step <= 10; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(step / 10) });
        await nextFrame(page);
      }
      await page.waitForTimeout(100);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move((frame.x + right) / 2, (Math.max(frame.y, 0) + bottom) / 2);
      await page.mouse.wheel(600, 600);
    }
  }
  await cdp.detach();
  await page.waitForTimeout(300);
}

/** The part of the grid frame on screen, in layout-viewport coordinates. */
function visibleFrame(page: Page) {
  return page.evaluate(() => {
    const frame = document.querySelector('[data-testid="favorites-grid-scroll"]')!.parentElement!.getBoundingClientRect();
    const visual = window.visualViewport!;
    return {
      left: Math.max(frame.left, visual.offsetLeft),
      top: Math.max(frame.top, visual.offsetTop),
      right: Math.min(frame.right, visual.offsetLeft + visual.width),
      bottom: Math.min(frame.bottom, visual.offsetTop + visual.height),
    };
  });
}

/** Width of one body cell on screen, in device-independent pixels. */
function cellOnScreen(page: Page) {
  return page.getByTestId('favorites-cell-normal-1').evaluate(
    (el) => el.getBoundingClientRect().width * (window.visualViewport?.scale ?? 1),
  );
}

test.describe('favorite picker zoom', () => {
  test('a zoomed grid scrolls until its last column and last row are on screen', async ({ page }, testInfo) => {
    await page.goto('/favorite-pokemon-by-type');
    const before = await cellOnScreen(page);
    await pinchGrid(page, testInfo, 2);
    expect(await cellOnScreen(page)).toBeGreaterThan(before * 1.8);

    await scrollGrid(page, testInfo, 16);
    const visible: Box = await visibleFrame(page);
    const last: Box = await page.getByTestId('favorites-cell-favorite-favorite').evaluate((el) => {
      const box = el.getBoundingClientRect();
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    });
    await page.screenshot({ path: testInfo.outputPath('zoomed-far-corner.png') });
    expect(last.right).toBeLessThanOrEqual(visible.right + 1);
    expect(last.bottom).toBeLessThanOrEqual(visible.bottom + 1);
    expect(last.left).toBeGreaterThanOrEqual(visible.left - 1);
    expect(last.top).toBeGreaterThanOrEqual(visible.top - 1);
  });

  test('the header row and generation column stay on the visible edges while zoomed', async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      localStorage.setItem('favorite-picker', JSON.stringify({
        state: { fills: { 'fire|3': 257, 'water|3': 260, 'grass|4': 389, 'dragon|4': 445 } },
        version: 1,
      }));
    });
    await page.goto('/favorite-pokemon-by-type');
    await pinchGrid(page, testInfo, 2);
    await scrollGrid(page, testInfo, 1);

    const edges = await page.evaluate(() => {
      const grid = document.querySelector('[data-testid="favorites-grid"]')!;
      const typeHeaders = [...grid.querySelectorAll(':scope > div:not([data-row-banded])')].map((el) => el.getBoundingClientRect());
      const genHeaders = [...document.querySelectorAll('div[data-row-banded]')].map((el) => el.getBoundingClientRect());
      const first = document.querySelector('[data-testid="favorites-cell-normal-1"]')!.getBoundingClientRect();
      return {
        headerTop: Math.min(...typeHeaders.map((box) => box.top)),
        genLeft: Math.min(...genHeaders.map((box) => box.left)),
        firstLeft: first.left,
        firstTop: first.top,
        cell: first.width,
      };
    });
    const visible = await visibleFrame(page);
    await page.screenshot({ path: testInfo.outputPath('zoomed-sticky-headers.png') });
    // The first body cell has moved up and left, so the view is scrolled on
    // both axes and only sticky headers can still be at the edges.
    expect(edges.firstTop).toBeLessThan(visible.top + edges.cell - 1);
    expect(edges.firstLeft).toBeLessThan(visible.left + edges.cell - 1);
    expect.soft(edges.headerTop, 'header row top').toBeCloseTo(visible.top, 0);
    expect.soft(edges.genLeft, 'generation column left').toBeCloseTo(visible.left, 0);

    // The headers paint above scrolled body cells and their sprites.
    const hits = await page.evaluate(({ visible, cell }) => {
      const at = (x: number, y: number) => document.elementFromPoint(x, y);
      const header = at(visible.left + cell * 1.5, visible.top + cell * 0.9);
      const gen = at(visible.left + cell * 0.9, visible.top + cell * 1.5);
      return {
        header: Boolean(header?.closest('[data-testid="favorites-grid"] > div:not([data-row-banded])')),
        gen: Boolean(gen?.closest('div[data-row-banded]')),
      };
    }, { visible, cell: edges.cell });
    expect(hits).toEqual({ header: true, gen: true });
  });

  test('the minimap holds still and unscaled through a pinch', async ({ page }, testInfo) => {
    await page.goto('/favorite-pokemon-by-type');
    await expect(page.getByTestId('favorites-minimap')).toBeAttached();
    await page.evaluate(() => {
      const samples: Array<{ right: number; bottom: number; scaleX: number; opacity: number }> = [];
      (window as unknown as { minimapSamples: typeof samples }).minimapSamples = samples;
      const tick = () => {
        const map = document.querySelector<HTMLElement>('[data-testid="favorites-minimap"]');
        const visual = window.visualViewport!;
        if (map) {
          const box = map.getBoundingClientRect();
          const style = getComputedStyle(map);
          samples.push({
            right: (box.right - visual.offsetLeft) * visual.scale,
            bottom: (box.bottom - visual.offsetTop) * visual.scale,
            scaleX: style.transform === 'none' ? 1 : new DOMMatrix(style.transform).a,
            opacity: Number(style.opacity),
          });
        }
        if (samples.length < 600) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await pinchGrid(page, testInfo, 2);
    const samples = await page.evaluate(() => {
      const all = (window as unknown as { minimapSamples: Array<{ right: number; bottom: number; scaleX: number; opacity: number }> }).minimapSamples;
      return all.splice(0);
    });
    await page.screenshot({ path: testInfo.outputPath('minimap-after-pinch.png') });

    expect(samples.length).toBeGreaterThan(10);
    const drift = Math.max(...samples.map((sample) => Math.max(
      Math.abs(sample.right - samples[0].right),
      Math.abs(sample.bottom - samples[0].bottom),
    )));
    const scale = Math.max(...samples.map((sample) => Math.abs(sample.scaleX - 1)));
    expect.soft(drift, 'on-screen movement of the minimap corner, px').toBeLessThan(1);
    expect.soft(scale, 'scale transform on the minimap').toBeLessThan(0.001);
    expect(Math.max(...samples.map((sample) => sample.opacity)), 'minimap opacity while zooming').toBeGreaterThan(0.5);
  });
});
