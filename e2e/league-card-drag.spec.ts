import { expect, test, type Page } from './support/test';
import { blankLeague, seededLeague } from './support/leagueSeed';

// platform: dnd-kit's layout-shift compensation reads a held cell's lift as a page shift, and touch-action pan-y lets the pane pan under a drag.

test.use({ viewport: { width: 393, height: 560 }, hasTouch: true, isMobile: true });

const openCard = async (page: Page) => {
  await seededLeague(page);
  await page.goto('/custom-gym-leader');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.click('[data-testid="league-slot-0"]');
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(600);
};

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
    for (const a of new Set(actions)) {
      expect(a, 'a filled cell must not hand the browser a pan').toBe('none');
    }
  });

  test('hands the pan back where there is nothing to drag', async ({ page }) => {
    await blankLeague(page);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(600);
    const actions = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="card-cell-"]')]
        .filter((el) => !el.querySelector('img'))
        .map((el) => getComputedStyle(el).touchAction));
    expect(actions.length, 'a blank card is all empty cells').toBeGreaterThan(20);
    for (const a of new Set(actions)) {
      expect(a, 'an empty cell keeps the card scrollable').toBe('pan-x pan-y');
    }
  });

  test('does not scroll the card when a line is pressed and held', async ({ page }) => {
    await openCard(page);
    const before = await paneTop(page);
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

test.describe('a press decides which gesture it is', () => {
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
    const box = (await page.locator('[data-testid="card-cell-4-3"]').boundingBox())!;
    const { lifted } = await press(page, '[data-testid="card-cell-4-3"]', box.height);
    expect(lifted, 'no column is lifted for a boundary drag').toBe(0);
  });
});

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
    await page.waitForTimeout(420);
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
    await page.waitForTimeout(420);
    for (let i = 1; i <= 8; i += 1) {
      await touch('touchMove', x + ((to.x - from.x) * i) / 8);
      await page.waitForTimeout(35);
    }
    await page.waitForTimeout(300);

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

test.describe('a pinch belongs to the card', () => {
  // platform: No touchcancel fires when a second finger lands, so a sensor that waits for one turns the pinch into a drag.
  for (const lag of [40, 320]) {
    test(`a pinch on two lines zooms the card and leaves its lines as they were (second finger after ${lag} ms)`, async ({ page }, testInfo) => {
      await openCard(page);
      const lines = () =>
        page.evaluate(() => JSON.parse(window.localStorage.getItem('league-builder')!).state.cards[0].lines);
      const before = await lines();

      // platform: Near the screen's edge, the browser clamps a synthetic pinch short of its spread.
      const a = (await page.locator('[data-testid="card-cell-8-4"]').boundingBox())!;
      const b = (await page.locator('[data-testid="card-cell-8-3"]').boundingBox())!;
      const y = a.y + a.height / 2;
      const cdp = await page.context().newCDPSession(page);
      const fingers = (spread: number) => [
        { x: a.x + a.width / 2 - spread, y, radiusX: 10, radiusY: 10, force: 1, id: 1 },
        { x: b.x + b.width / 2 + spread, y, radiusX: 10, radiusY: 10, force: 1, id: 2 },
      ];

      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(0).slice(0, 1) });
      await page.waitForTimeout(lag);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(0) });
      for (let i = 1; i <= 20; i += 1) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers((50 * i) / 20) });
        await page.waitForTimeout(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(400);

      const scale = await page.evaluate(() => window.visualViewport?.scale ?? 1);
      const cardZoom = Number(await page.getAttribute('[data-testid="card-zoom-frame"]', 'data-card-zoom'));
      const after = await lines();
      await testInfo.attach('pinch.json', {
        body: JSON.stringify({ lag, scale: +scale.toFixed(2), cardZoom, unchanged: JSON.stringify(after) === JSON.stringify(before) }, null, 2),
        contentType: 'application/json',
      });
      expect(after, 'the pinch left every line where it was').toEqual(before);
      expect(scale, 'the page did not zoom').toBe(1);
      expect(cardZoom, 'the card zoomed').toBeGreaterThan(1.3);
    });
  }
});
