import { expect, test, type CDPSession, type Page, type TestInfo } from './support/test';
import { seededLeague } from './support/leagueSeed';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

type Line = { branch: number[]; boundaries: number[] };

const openCard = async (page: Page) => {
  await seededLeague(page);
  await page.goto('/custom-gym-leader');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.click('[data-testid="league-slot-0"]');
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(600);
};

const lines = (page: Page): Promise<Line[]> =>
  page.evaluate(() => JSON.parse(window.localStorage.getItem('league-builder')!).state.cards[0].lines);

const frameState = (page: Page) =>
  page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>('[data-testid="card-zoom-frame"]')!;
    const pane = frame.closest('[data-lg-viewport]')!;
    const cell = document.querySelector('[data-testid="card-cell-8-3"]')!.getBoundingClientRect();
    return {
      cardZoom: frame.dataset.cardZoom!,
      overflow: getComputedStyle(frame).overflowY,
      maxHeight: getComputedStyle(frame).maxHeight,
      frameTop: +frame.scrollTop.toFixed(2),
      frameLeft: +frame.scrollLeft.toFixed(2),
      paneTop: +pane.scrollTop.toFixed(2),
      pageScale: window.visualViewport?.scale ?? 1,
      cell: { width: +cell.width.toFixed(3), height: +cell.height.toFixed(3) },
    };
  });

const centerOf = async (page: Page, selector: string) => {
  const box = (await page.locator(selector).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const touch = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) =>
  cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, radiusX: 10, radiusY: 10, force: 1, id: i + 1 })),
  });

async function pinch(page: Page, center: { x: number; y: number }, from: number, to: number, lag = 40) {
  const cdp = await page.context().newCDPSession(page);
  const fingers = (d: number) => [
    { x: center.x - d / 2, y: center.y },
    { x: center.x + d / 2, y: center.y },
  ];
  await touch(cdp, 'touchStart', fingers(from).slice(0, 1));
  await page.waitForTimeout(lag);
  await touch(cdp, 'touchStart', fingers(from));
  for (let i = 1; i <= 20; i += 1) {
    await touch(cdp, 'touchMove', fingers(from + ((to - from) * i) / 20));
    await page.waitForTimeout(16);
  }
  await touch(cdp, 'touchEnd', []);
  await page.waitForTimeout(400);
  await cdp.detach();
}

const pinchCenter = async (page: Page) => {
  const a = await centerOf(page, '[data-testid="card-cell-8-3"]');
  const b = await centerOf(page, '[data-testid="card-cell-8-4"]');
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
};

const zoomToTwo = async (page: Page) => pinch(page, await pinchCenter(page), 60, 120);

const onCell = (page: Page, point: { x: number; y: number }) =>
  page.evaluate(({ x, y }) => {
    const r = document.querySelector('[data-testid="card-cell-8-3"]')!.getBoundingClientRect();
    return { u: +((x - r.left) / r.width).toFixed(3), v: +((y - r.top) / r.height).toFixed(3) };
  }, point);

const attach = (testInfo: TestInfo, name: string, body: unknown) =>
  testInfo.attach(name, { body: JSON.stringify(body, null, 2), contentType: 'application/json' });

test.describe('a pinch zooms the card, not the page', () => {
  test('the card grows inside its frame by the pinch', async ({ page }, testInfo) => {
    await openCard(page);
    const before = await frameState(page);
    const center = await pinchCenter(page);
    const focus = await onCell(page, center);
    await zoomToTwo(page);
    const after = await frameState(page);
    const held = await onCell(page, center);
    await attach(testInfo, 'zoom.json', { before, after, focus, held });

    expect(after.pageScale, 'the page did not zoom').toBe(1);
    expect(Number(after.cardZoom), 'the card zoomed').toBeGreaterThan(1.5);
    expect(after.overflow, 'the zoomed card scrolls inside its frame').toBe('auto');
    expect(after.cell.width / before.cell.width, 'a cell grew by the card zoom').toBeCloseTo(Number(after.cardZoom), 1);
    expect(Math.abs(after.cell.width / before.cell.width / Number(after.cardZoom) - 1)).toBeLessThan(0.05);
    expect(after.paneTop, 'nothing around the card moved').toBe(before.paneTop);
    expect(Math.abs(held.u - focus.u), 'the point under the fingers stayed under them').toBeLessThan(0.05);
    expect(Math.abs(held.v - focus.v)).toBeLessThan(0.05);
  });

  test('pinching back to the fit lays the card out as before', async ({ page }, testInfo) => {
    await openCard(page);
    const before = await frameState(page);
    await zoomToTwo(page);
    const zoomed = await frameState(page);
    await pinch(page, await pinchCenter(page), 160, 50);
    const after = await frameState(page);
    await attach(testInfo, 'fit.json', { before, zoomed, after });

    expect(Number(zoomed.cardZoom), 'the card was zoomed first').toBeGreaterThan(1.5);
    expect(after.cardZoom, 'the card is back at its fit').toBe('1');
    expect(after.overflow, 'the frame does not scroll').toBe('visible');
    expect(after.maxHeight).toBe('none');
    expect(after.frameTop).toBe(0);
    expect(after.cell, 'every cell is its old size').toEqual(before.cell);
    expect(after.pageScale).toBe(1);
  });
});

test.describe('one finger keeps its gestures on a zoomed card', () => {
  test('a held column moves one seat left', async ({ page }, testInfo) => {
    await openCard(page);
    const before = await lines(page);
    await zoomToTwo(page);
    const zoom = (await frameState(page)).cardZoom;

    const target = await page.evaluate(() => {
      const f = document.querySelector('[data-testid="card-zoom-frame"]')!.getBoundingClientRect();
      const inside = (r: DOMRect) =>
        r.left >= f.left && r.right <= f.right && r.top >= f.top && r.bottom <= Math.min(f.bottom, window.innerHeight);
      for (const cell of document.querySelectorAll('[data-testid^="card-cell-"]')) {
        const [, , row, seat] = cell.getAttribute('data-testid')!.split('-').map(Number);
        const left = document.querySelector(`[data-testid="card-cell-${row}-${seat + 1}"]`);
        if (!cell.querySelector('img') || !left?.querySelector('img')) continue;
        const a = cell.getBoundingClientRect();
        const b = left.getBoundingClientRect();
        if (!inside(a) || !inside(b) || b.left >= a.left) continue;
        return { row, seat, from: { x: a.x + a.width / 2, y: a.y + a.height / 2 }, to: { x: b.x + b.width / 2, y: b.y + b.height / 2 } };
      }
      return null;
    });
    expect(target, 'a filled cell and its left neighbour are in view').not.toBeNull();
    const { seat, from, to } = target!;

    const cdp = await page.context().newCDPSession(page);
    await touch(cdp, 'touchStart', [from]);
    await page.waitForTimeout(420);
    const lifted = await page.locator('[data-seat-open]').count();
    for (let i = 1; i <= 8; i += 1) {
      await touch(cdp, 'touchMove', [{ x: from.x + ((to.x - from.x) * i) / 8, y: from.y }]);
      await page.waitForTimeout(35);
    }
    await page.waitForTimeout(250);
    await touch(cdp, 'touchEnd', []);
    await page.waitForTimeout(600);
    await cdp.detach();

    const after = await lines(page);
    const state = await frameState(page);
    await attach(testInfo, 'column.json', { zoom, target, lifted, before: before.map((l) => l.branch), after: after.map((l) => l.branch), state });

    expect(lifted, 'the hold lifted the column').toBeGreaterThan(0);
    expect(after[seat].branch, 'the column moved one seat left').toEqual(before[seat - 1].branch);
    expect(after[seat - 1].branch, 'its neighbour took its seat').toEqual(before[seat].branch);
    expect(state.pageScale).toBe(1);
  });

  test('a stage dragged up a row moves its evolution boundary', async ({ page }, testInfo) => {
    await openCard(page);
    const before = await lines(page);
    await zoomToTwo(page);
    const zoom = (await frameState(page)).cardZoom;

    const target = await page.evaluate((held) => {
      const frame = document.querySelector<HTMLElement>('[data-testid="card-zoom-frame"]')!;
      const inside = (r: DOMRect) => {
        const f = frame.getBoundingClientRect();
        return r.left >= f.left && r.right <= f.right && r.top >= f.top && r.bottom <= Math.min(f.bottom, window.innerHeight);
      };
      for (const [i, line] of held.entries()) {
        for (let k = 1; k < line.boundaries.length; k += 1) {
          const row = line.boundaries[k];
          if (row - 1 <= line.boundaries[k - 1]) continue;
          const seat = i + 1;
          const cell = document.querySelector(`[data-testid="card-cell-${row}-${seat}"]`);
          const up = document.querySelector(`[data-testid="card-cell-${row - 1}-${seat}"]`);
          if (!cell || !up) continue;
          const f = frame.getBoundingClientRect();
          const c = cell.getBoundingClientRect();
          frame.scrollTop += c.top + c.height / 2 - (f.top + f.height / 2);
          frame.scrollLeft += c.left + c.width / 2 - (f.left + f.width / 2);
          const a = cell.getBoundingClientRect();
          const b = up.getBoundingClientRect();
          if (!inside(a) || !inside(b)) continue;
          return { seat, stage: k, row, from: { x: a.x + a.width / 2, y: a.y + a.height / 2 }, to: { x: b.x + b.width / 2, y: b.y + b.height / 2 } };
        }
      }
      return null;
    }, before);
    expect(target, 'a stage with a row of room above it is in view').not.toBeNull();
    const { seat, stage, row, from, to } = target!;
    await page.waitForTimeout(150);

    const cdp = await page.context().newCDPSession(page);
    await touch(cdp, 'touchStart', [from]);
    for (let i = 1; i <= 3; i += 1) {
      await page.waitForTimeout(30);
      await touch(cdp, 'touchMove', [{ x: from.x, y: from.y + ((to.y - from.y) * i) / 3 }]);
    }
    await page.waitForTimeout(250);
    await touch(cdp, 'touchEnd', []);
    await page.waitForTimeout(400);
    await cdp.detach();

    const after = await lines(page);
    const state = await frameState(page);
    await attach(testInfo, 'boundary.json', {
      zoom, target, before: before[seat - 1].boundaries, after: after[seat - 1].boundaries, state,
    });

    expect(after[seat - 1].boundaries[stage], `the stage starts a row up: ${before[seat - 1].boundaries} -> ${after[seat - 1].boundaries}`).toBe(row - 1);
    expect(state.pageScale).toBe(1);
  });

  test('a swipe that starts off the cells pans the card and changes nothing', async ({ page }, testInfo) => {
    await openCard(page);
    const before = await lines(page);
    await zoomToTwo(page);
    const zoomed = await frameState(page);

    // platform: The browser targets a touch that lands just outside a cell at that cell.
    const start = await page.evaluate(() => {
      const frame = document.querySelector<HTMLElement>('[data-testid="card-zoom-frame"]')!;
      const f = frame.getBoundingClientRect();
      const controls = [...frame.querySelectorAll('button, input, a, [role="button"], [tabindex]')]
        .map((el) => el.getBoundingClientRect());
      const clear = (x: number, y: number) => controls.every((r) =>
        x < r.left - 20 || x > r.right + 20 || y < r.top - 20 || y > r.bottom + 20);
      for (let y = Math.min(f.bottom, window.innerHeight) - 16; y > f.top + 140; y -= 4) {
        for (let x = f.right - 16; x > f.left + 140; x -= 4) {
          const el = document.elementFromPoint(x, y);
          if (el && frame.contains(el) && clear(x, y)) return { x, y, under: el.tagName.toLowerCase() };
        }
      }
      return null;
    });
    expect(start, 'a bare spot on the card is in view').not.toBeNull();

    const cdp = await page.context().newCDPSession(page);
    await touch(cdp, 'touchStart', [start!]);
    // platform: A diagonal swipe stops the browser from locking the pan to one axis.
    for (let i = 1; i <= 12; i += 1) {
      await touch(cdp, 'touchMove', [{ x: start!.x - (120 * i) / 12, y: start!.y - (120 * i) / 12 }]);
      await page.waitForTimeout(16);
    }
    await touch(cdp, 'touchEnd', []);
    await page.waitForTimeout(500);
    await cdp.detach();

    const after = await frameState(page);
    const held = await lines(page);
    await attach(testInfo, 'pan.json', { start, zoomed, after });

    expect(after.frameTop - zoomed.frameTop, 'the card scrolled up inside its frame').toBeGreaterThan(60);
    expect(after.frameLeft - zoomed.frameLeft, 'and sideways').toBeGreaterThan(60);
    expect(after.paneTop, 'nothing around the card moved').toBe(zoomed.paneTop);
    expect(after.cardZoom).toBe(zoomed.cardZoom);
    expect(after.pageScale).toBe(1);
    expect(held, 'every line is where it was').toEqual(before);
  });
});
