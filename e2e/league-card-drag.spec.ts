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
  await page.goto('/custom-gym-leader');
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
    await page.goto('/custom-gym-leader');
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

/**
 * The card's two gestures begin identically, and part company on movement.
 *
 * A press that stays inside the cell it pressed picks that column up, ready
 * to reorder. One that sets off first is aiming at an evolution boundary, and
 * lifting its column would say the wrong thing about what the finger is
 * doing — the column read as picked up the instant the hold was up, on every
 * boundary drag. The line between them is the cell's own radius.
 */
test.describe('a press decides which gesture it is', () => {
  /** Press a cell, drift by `drift` px during the hold, and report the lift. */
  const press = async (page: Page, cell: string, drift: number) => {
    const box = (await page.locator(cell).boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', ty: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd'
          ? []
          : [{ x, y: ty, radiusX: 10, radiusY: 10, force: 1, id: 1 }],
      });
    await touch('touchStart', y);
    for (let i = 1; i <= 5; i += 1) {
      await touch('touchMove', y + (drift * i) / 5);
      await page.waitForTimeout(30);
    }
    // Past the sensor's own hold, so the drag has begun either way.
    await page.waitForTimeout(420);
    const lifted = await page.locator('[data-seat-open]').count();
    await touch('touchEnd', y + drift);
    await page.waitForTimeout(200);
    return { lifted, radius: box.height / 2 };
  };

  test('a still press lifts the column', async ({ page }) => {
    await openCard(page);
    const { lifted } = await press(page, '[data-testid="card-cell-4-3"]', 0);
    expect(lifted, 'the column is in hand').toBeGreaterThan(0);
  });

  test('a press that leaves its cell does not', async ({ page }) => {
    await openCard(page);
    // Twice the cell's own radius, which is a boundary drag by any reading.
    const box = (await page.locator('[data-testid="card-cell-4-3"]').boundingBox())!;
    const { lifted } = await press(page, '[data-testid="card-cell-4-3"]', box.height);
    expect(lifted, 'no column is lifted for a boundary drag').toBe(0);
  });
});

/**
 * What the preview shows is what the drop lands.
 *
 * The powerup and the legendary both name a *seat*, and the store re-aims
 * them when a column moves. The preview did not, so a column carrying a Mega
 * showed its base form the whole way across the card while the column it
 * displaced wore the Mega instead — and the two only swapped to the truth
 * once the finger came up. Measured on the seeded champion card, whose seat 3
 * already wears one.
 */
test.describe('a carried column keeps what it carries', () => {
  const bossRow = (page: Page) =>
    page.evaluate(() => {
      const out: Record<number, string | null> = {};
      for (let seat = 1; seat <= 6; seat += 1) {
        const cell = document.querySelector(`[data-testid="card-cell-11-${seat}"]`);
        out[seat] = cell?.querySelector('img')?.getAttribute('src')?.split('/').pop() ?? null;
      }
      return out;
    });

  test('a Mega travels with its column, not with its seat', async ({ page }) => {
    await seededLeague(page);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-12"]');
    await page.click('[data-testid="league-slot-12"]');
    await page.waitForSelector('[data-testid="card-cell-11-1"]');
    await page.waitForTimeout(700);

    const atRest = await bossRow(page);
    // A form id above 10000 is a Mega or a Gigantamax.
    const megaSeat = Number(
      Object.keys(atRest).find((s) => Number((atRest[Number(s)] ?? '0').replace('.png', '')) > 10000),
    );
    expect(megaSeat, 'the seeded champion wears a Mega').toBeGreaterThan(0);
    const mega = atRest[megaSeat];
    const target = megaSeat === 1 ? 3 : 1;

    const from = (await page.locator(`[data-testid="card-cell-6-${megaSeat}"]`).boundingBox())!;
    const to = (await page.locator(`[data-testid="card-cell-6-${target}"]`).boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const x = from.x + from.width / 2;
    const y = from.y + from.height / 2;
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', tx: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd'
          ? []
          : [{ x: tx, y, radiusX: 10, radiusY: 10, force: 1, id: 1 }],
      });

    await touch('touchStart', x);
    await page.waitForTimeout(420);          // a still press: the column lifts
    for (let i = 1; i <= 8; i += 1) {
      await touch('touchMove', x + ((to.x - from.x) * i) / 8);
      await page.waitForTimeout(35);
    }
    await page.waitForTimeout(250);
    const during = await bossRow(page);
    await touch('touchEnd', to.x + to.width / 2);
    await page.waitForTimeout(600);
    const landed = await bossRow(page);

    expect(during[target], 'the Mega is carried, not left behind').toBe(mega);
    expect(during, 'the preview is what the drop lands').toEqual(landed);
  });

  test('the legendary on a held column rises with it', async ({ page }) => {
    // Seeded here rather than through the picker: the test needs one column
    // that carries a legendary, and clicking through to place one proves
    // nothing this test is about.
    await page.addInitScript(() => {
      const blank = {
        type: null, theme: '', lines: [], signatureSeat: null,
        tmMoveId: null, badgeName: '', legend: null, powerup: null,
      };
      const cards: unknown[] = Array.from({ length: 14 }, () => ({ ...blank }));
      cards[12] = {
        ...blank,
        type: 'dragon',
        legends: [{ pokemonId: 144, seat: 3 }],
        lines: [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12], [13, 14, 15], [16, 17, 18]]
          .map((branch) => ({ branch, boundaries: [] })),
      };
      window.localStorage.setItem(
        'league-builder',
        JSON.stringify({ state: { name: 'Legend lift', cards }, version: 1 }),
      );
    });
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-12"]');
    await page.click('[data-testid="league-slot-12"]');
    await page.waitForSelector('[data-testid="card-cell-11-1"]');
    await page.waitForTimeout(700);

    const from = (await page.locator('[data-testid="card-cell-10-3"]').boundingBox())!;
    const to = (await page.locator('[data-testid="card-cell-10-5"]').boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const y = from.y + from.height / 2;
    const x = from.x + from.width / 2;
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', tx: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd'
          ? []
          : [{ x: tx, y, radiusX: 12, radiusY: 12, force: 1, id: 1 }],
      });

    await touch('touchStart', x);
    await page.waitForTimeout(420);          // a still press: the column lifts
    for (let i = 1; i <= 8; i += 1) {
      await touch('touchMove', x + ((to.x - from.x) * i) / 8);
      await page.waitForTimeout(35);
    }
    await page.waitForTimeout(300);

    // The column previews at seat 5, so seat 5 is the column in hand. Every
    // cell it carries must sit at the same height: a boss row left on the
    // card is a hole in the middle of the thing being dragged.
    const column = await page.evaluate(() => {
      const lift = (row: number) => {
        const el = document.querySelector(`[data-testid="card-cell-${row}-5"]`);
        if (!el?.querySelector('img')) return null;
        const m = /matrix\(1, 0, 0, 1, [-\d.]+, ([-\d.]+)\)/.exec(getComputedStyle(el).transform);
        return m ? Number(m[1]) : 0;
      };
      return { r8: lift(8), r9: lift(9), r10: lift(10), boss: lift(11) };
    });
    await touch('touchEnd', to.x + to.width / 2);

    expect(column.r8, 'the column is in hand').toBeLessThan(0);
    expect(column.boss, 'the legendary rises with its column').toBe(column.r8);
    expect(column.r9).toBe(column.r8);
    expect(column.r10).toBe(column.r8);
  });
});
