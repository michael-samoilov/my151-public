import { expect, test, type Page } from '@playwright/test';
import { blankLeague, seededLeague } from './support/leagueSeed';

/**
 * A touch that lands on a card cell belongs to the drag, and to nothing else.
 *
 * The card is a grid whose whole purpose is dragging a line up, down and
 * across, and it sits in a pane that scrolls. Two things used to take that
 * gesture away. The cell asked for `touch-action: pan-y`, so the browser
 * panned the pane under the very drag meant to move a line up a row. And
 * dnd-kit's layout-shift compensation read the held cell's own lift as the
 * page having shifted, and scrolled the pane by the same amount — so every
 * press and hold jumped the card three pixels before the drag had begun.
 *
 * Both are measured here rather than reasoned about: the first from the
 * computed style, the second by watching the pane's `scrollTop` across a real
 * press.
 */

// The card fills the viewport by design — it is scaled to fit — so a pane with
// something to scroll has to be asked for.
test.use({ viewport: { width: 393, height: 560 }, hasTouch: true, isMobile: true });

const openCard = async (page: Page) => {
  await seededLeague(page);
  await page.goto('/pokemon-league-builder');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.click('[data-testid="league-slot-0"]');
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(600);
};

/** The scrollable ancestor a cell actually lives in, and where it sits. */
const paneTop = (page: Page) =>
  page.evaluate(() => {
    const cell = document.querySelector('[data-testid="card-cell-4-3"]')!;
    let el = cell.parentElement;
    while (el && !(el.scrollHeight - el.clientHeight > 2 && getComputedStyle(el).overflowY === 'auto')) {
      el = el.parentElement;
    }
    return el ? { top: +el.scrollTop.toFixed(2), max: +(el.scrollHeight - el.clientHeight).toFixed(2) } : null;
  });

test.describe('a card cell owns the touch it starts', () => {
  test('never offers the browser a vertical pan', async ({ page }) => {
    await openCard(page);
    const actions = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="card-cell-"]')]
        .filter((el) => el.querySelector('img'))
        .map((el) => getComputedStyle(el).touchAction));
    expect(actions.length, 'the seeded card has lines to drag').toBeGreaterThan(20);
    // `pan-y` is what let the pane scroll under a drag. `none` would be worse
    // still: it takes the browser's pinch-zoom with it, and the cells are most
    // of the card.
    for (const a of new Set(actions)) {
      expect(a, 'a filled cell must not hand the browser a pan').toBe('pinch-zoom');
    }
  });

  test('hands the pan back where there is nothing to drag', async ({ page }) => {
    await blankLeague(page);
    await page.goto('/pokemon-league-builder');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(600);
    // An empty cell opens a picker on a tap and offers no drag at all, so
    // taking the page's scroll from it buys nothing and costs the reader a
    // dead patch the size of the grid.
    const actions = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="card-cell-"]')]
        .filter((el) => !el.querySelector('img'))
        .map((el) => getComputedStyle(el).touchAction));
    expect(actions.length, 'a blank card is all empty cells').toBeGreaterThan(20);
    for (const a of new Set(actions)) {
      expect(a, 'an empty cell keeps the page scrollable').toBe('pan-y pinch-zoom');
    }
  });

  test('does not scroll the card when a line is pressed and held', async ({ page }) => {
    await openCard(page);
    const before = await paneTop(page);
    // Nothing to prove on a card that cannot scroll at all.
    test.skip(!before || before.max < 8, 'the card fits its pane at this size');

    await page.evaluate(() => {
      const cell = document.querySelector('[data-testid="card-cell-4-3"]')!;
      let el = cell.parentElement;
      while (el && !(el.scrollHeight - el.clientHeight > 2 && getComputedStyle(el).overflowY === 'auto')) {
        el = el.parentElement;
      }
      el!.scrollTop = Math.round((el!.scrollHeight - el!.clientHeight) / 2);
    });
    await page.waitForTimeout(120);
    const parked = await paneTop(page);

    const box = (await page.locator('[data-testid="card-cell-4-3"]').boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', ty: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd'
          ? []
          : [{ x, y: ty, radiusX: 12, radiusY: 12, force: 1, id: 1 }],
      });

    await touch('touchStart', y);
    await page.waitForTimeout(500);
    const held = await paneTop(page);
    expect(await page.locator('[data-seat-open]').count(), 'the hold picked the line up').toBeGreaterThan(0);
    await touch('touchEnd', y);
    await page.waitForTimeout(200);

    expect(held!.top, 'the card stayed where it was').toBeCloseTo(parked!.top, 1);
  });
});
