import { expect, test, type Page, type TestInfo } from '@playwright/test';

/**
 * Pinch zoom on the favorite picker grid, driven with real input: two-finger
 * CDP touches on touch projects and a synthesized touchpad pinch elsewhere.
 * Every measurement is taken on screen, through the visual viewport, so it
 * holds whether the grid or the whole page zooms.
 */

type Box = { left: number; top: number; right: number; bottom: number };

const nextFrame = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

/** The middle of the grid frame's visible part, where every pinch lands. */
async function pinchPoint(page: Page) {
  const frame = (await page.getByTestId('favorites-grid-scroll').boundingBox())!;
  const viewport = page.viewportSize()!;
  return {
    x: frame.x + frame.width / 2,
    y: (Math.max(frame.y, 0) + Math.min(frame.y + frame.height, viewport.height)) / 2,
  };
}

async function pinchGrid(page: Page, testInfo: TestInfo, factor: number) {
  const { x, y } = await pinchPoint(page);
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
  // Start above the minimap. While it shows, a finger on it drives the minimap.
  const bottom = Math.min(frame.y + frame.height, viewport.height) - 100;
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

test.describe('favorite picker zoom', { tag: '@viewport' }, () => {
  test('a zoomed grid scrolls until its last column and last row are on screen', async ({ page }, testInfo) => {
    await page.goto('/favorite-pokemon-picker');
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
    await testInfo.attach('far-corner.json', { body: JSON.stringify({ visible, last }), contentType: 'application/json' });
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
    await page.goto('/favorite-pokemon-picker');
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
        rowHeight: typeHeaders[typeHeaders.length - 1].height,
        columnWidth: genHeaders[0].width,
      };
    });
    const visible = await visibleFrame(page);
    await page.screenshot({ path: testInfo.outputPath('zoomed-sticky-headers.png') });
    await testInfo.attach('sticky-headers.json', { body: JSON.stringify({ visible, edges }), contentType: 'application/json' });
    // The first body cell has moved up and left, so the view is scrolled on
    // both axes and only sticky headers can still be at the edges.
    expect(edges.firstTop).toBeLessThan(visible.top + edges.rowHeight - 1);
    expect(edges.firstLeft).toBeLessThan(visible.left + edges.columnWidth - 1);
    expect.soft(edges.headerTop, 'header row top').toBeCloseTo(visible.top, 0);
    expect.soft(edges.genLeft, 'generation column left').toBeCloseTo(visible.left, 0);

    // The headers paint above scrolled body cells and their sprites.
    const hits = await page.evaluate(({ visible, row, column }) => {
      const at = (x: number, y: number) => document.elementFromPoint(x, y);
      const header = at(visible.left + column * 1.5, visible.top + row * 0.9);
      const gen = at(visible.left + column * 0.9, visible.top + row * 1.5);
      return {
        header: Boolean(header?.closest('[data-testid="favorites-grid"] > div:not([data-row-banded])')),
        gen: Boolean(gen?.closest('div[data-row-banded]')),
      };
    }, { visible, row: edges.rowHeight, column: edges.columnWidth });
    expect(hits).toEqual({ header: true, gen: true });
  });

  test('headers stay compact at maximum zoom and the pinch point holds', async ({ page }, testInfo) => {
    await page.goto('/favorite-pokemon-picker');
    // On-screen header sizes and the body cell under the pinch point, with
    // where in that cell the point falls.
    const measure = (point: { x: number; y: number }, testId?: string) => page.evaluate(({ point, testId }) => {
      const grid = document.querySelector('[data-testid="favorites-grid"]')!;
      const typeHeader = [...grid.querySelectorAll(':scope > div:not([data-row-banded])')].at(-1)!.getBoundingClientRect();
      const genHeader = document.querySelector('div[data-row-banded]')!.getBoundingClientRect();
      const cell = testId
        ? document.querySelector(`[data-testid="${testId}"]`)!
        : document.elementFromPoint(point.x, point.y)!.closest('button[data-testid^="favorites-cell-"]')!;
      const box = cell.getBoundingClientRect();
      return {
        rowHeight: typeHeader.height,
        columnWidth: genHeader.width,
        cellWidth: box.width,
        testId: cell.getAttribute('data-testid')!,
        fx: (point.x - box.left) / box.width,
        fy: (point.y - box.top) / box.height,
        box: { left: box.left, top: box.top, width: box.width, height: box.height },
      };
    }, { point, testId });
    const point = await pinchPoint(page);
    const before = await measure(point);
    await pinchGrid(page, testInfo, 5);
    const after = await measure(point, before.testId);
    await page.screenshot({ path: testInfo.outputPath('max-zoom.png') });
    await testInfo.attach('max-zoom.json', { body: JSON.stringify({ point, before, after }), contentType: 'application/json' });

    expect(after.cellWidth).toBeGreaterThan(before.cellWidth * 2.4);
    // The header row stops at 1.25x, plus what its column badges grow past
    // that: they keep their 5:1 shape at 90% of the column.
    const cappedHead = before.rowHeight * 1.25;
    expect.soft(after.rowHeight, 'header row height').toBeLessThanOrEqual(cappedHead + 0.18 * (after.cellWidth - cappedHead) + 1);
    expect.soft(after.columnWidth, 'generation column width').toBeLessThanOrEqual(before.columnWidth * 1.25 + 1);
    // A column badge keeps its 5:1 shape and spans 90% of its column.
    const badge = await page.evaluate(() => {
      const scroller = document.querySelector('[data-testid="favorites-grid-scroll"]')!.getBoundingClientRect();
      const shown = [...document.querySelectorAll('[data-testid^="favorites-header-badge-"]')]
        .filter((el) => !el.closest('[data-row-banded]'))
        .map((el) => el.getBoundingClientRect())
        .find((r) => r.left >= scroller.left && r.right <= scroller.right)!;
      return { width: shown.width, height: shown.height };
    });
    expect(badge.width / after.cellWidth, 'badge share of the column').toBeCloseTo(0.9, 2);
    expect(badge.width / badge.height, 'badge aspect').toBeCloseTo(5, 1);
    // The same spot of the same body cell is still under the pinch point.
    expect(Math.abs(after.box.left + before.fx * after.box.width - point.x), 'pinch point x').toBeLessThan(3);
    expect(Math.abs(after.box.top + before.fy * after.box.height - point.y), 'pinch point y').toBeLessThan(3);
  });

  test('the minimap holds still and unscaled through a pinch', async ({ page }, testInfo) => {
    await page.goto('/favorite-pokemon-picker');
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
    await testInfo.attach('minimap-samples.json', { body: JSON.stringify(samples), contentType: 'application/json' });

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

  test('a finger on the minimap drives the zoomed grid, and a faded minimap lets taps through', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use.hasTouch, 'The phone minimap takes finger drags.');
    await page.goto('/favorite-pokemon-picker');
    await pinchGrid(page, testInfo, 2);
    const scroll = page.getByTestId('favorites-grid-scroll');
    const map = page.getByTestId('favorites-minimap');
    const view = page.getByTestId('favorites-minimap-viewport');
    const state = () => scroll.evaluate((el) => {
      const minimap = document.querySelector<HTMLElement>('[data-testid="favorites-minimap"]')!;
      const inner = document.querySelector('[data-testid="favorites-minimap-viewport"]')!.parentElement!.getBoundingClientRect();
      return {
        left: el.scrollLeft,
        top: el.scrollTop,
        page: { x: window.scrollX, y: window.scrollY, scale: window.visualViewport?.scale ?? 1 },
        cell: document.querySelector('[data-testid="favorites-cell-normal-1"]')!.getBoundingClientRect().width,
        box: { width: inner.width, height: inner.height },
        opacity: Number(getComputedStyle(minimap).opacity),
        hit: getComputedStyle(minimap).pointerEvents,
      };
    });
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove', x: number, y: number) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [{ x, y, id: 1 }] });
    const lift = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    // Drag the window 20px right and 10px down from where the finger lands.
    const start = (await view.boundingBox())!;
    const x0 = start.x + start.width / 2;
    const y0 = start.y + start.height / 2;
    const before = await state();
    await touch('touchStart', x0, y0);
    for (let step = 1; step <= 10; step++) {
      await touch('touchMove', x0 + 2 * step, y0 + step);
      await nextFrame(page);
    }
    await expect.poll(async () => (await state()).opacity, {timeout: 2000}).toBe(1);
    const held = await state();
    await lift();
    await nextFrame(page);
    const dragged = await state();

    // A press off the window centers the window under the finger.
    const mapBox = (await map.boundingBox())!;
    const press = { x: mapBox.x + mapBox.width * 0.25, y: mapBox.y + mapBox.height * 0.5 };
    // Sample in the page one second after touchend. Driver round trips for
    // geometry can otherwise consume the 200ms margin before the fade starts.
    await page.evaluate(() => {
      const probe = new Promise<{opacity: number; hit: string; elapsed: number}>((resolve) => {
        window.addEventListener('touchend', () => {
          const started = performance.now();
          setTimeout(() => {
            const map = document.querySelector<HTMLElement>('[data-testid="favorites-minimap"]')!;
            resolve({opacity: Number(getComputedStyle(map).opacity), hit: getComputedStyle(map).pointerEvents, elapsed: performance.now() - started});
          }, 1000);
        }, {once: true});
      });
      (window as typeof window & {minimapLingerProbe: typeof probe}).minimapLingerProbe = probe;
    });
    await touch('touchStart', press.x, press.y);
    await lift();
    await nextFrame(page);
    const centered = (await view.boundingBox())!;
    const timed = await page.evaluate(() => (window as typeof window & {minimapLingerProbe: Promise<{opacity: number; hit: string; elapsed: number}>}).minimapLingerProbe);
    const lingering = {...await state(), ...timed};
    await page.screenshot({ path: testInfo.outputPath('minimap-touch-drag.png') });
    await expect.poll(async () => (await state()).opacity, { timeout: 4_000 }).toBeLessThan(0.05);
    const faded = await state();
    const under = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.dataset.testid ?? '', press);
    await cdp.detach();
    const picker = await page.getByTestId('favorites-picker').count();

    const expected = {
      left: 20 * 22 * before.cell / before.box.width,
      top: 10 * 12 * before.cell / before.box.height,
    };
    const result = { before, held, dragged, expected, press, centered, lingering, faded, under, picker };
    await testInfo.attach('minimap-touch-drag.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });

    expect(Number(await scroll.getAttribute('data-zoom'))).toBeGreaterThan(1.5);
    expect(held.opacity, 'minimap opacity under the finger').toBe(1);
    expect(dragged.left - before.left, 'scrollLeft after the drag').toBeCloseTo(expected.left, -1);
    expect(dragged.top - before.top, 'scrollTop after the drag').toBeCloseTo(expected.top, -1);
    expect(dragged.page, 'page scroll and zoom').toEqual(before.page);
    expect(Math.abs(centered.x + centered.width / 2 - press.x), 'window center x').toBeLessThan(1.5);
    expect(Math.abs(centered.y + centered.height / 2 - press.y), 'window center y').toBeLessThan(1.5);
    expect(picker, 'a finger on the minimap opens no cell').toBe(0);
    expect(lingering.opacity, 'minimap 1 s after the last touch').toBeGreaterThan(0.9);
    expect(lingering.hit).toBe('auto');
    expect(faded.hit).toBe('none');
    expect(under, 'cell under the faded minimap').toMatch(/^favorites-cell-/);
  });
});
