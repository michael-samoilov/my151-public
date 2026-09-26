import { expect, test, type Page } from '@playwright/test';

/**
 * How the fit pays for the room it needs.
 *
 * Two different ways, on purpose. The card squashes: it keeps the pane's full
 * width and gives up only height, which is what keeps a row's touch targets
 * as wide as the screen allows. The hint lines under it — the tail — are not
 * paid for that way, because squashing a card further to seat two lines of
 * 10px text is the wrong trade. Their room comes off both sides at once.
 *
 * That makes one number checkable, and it is the whole rule: the block ends
 * up narrower than the pane by exactly the tail's share of its height.
 *
 * That rule is the phone's. Desktop stopped squashing on purpose in a34b5dd9
 * and f2676ee5, which reached production in merge 07a820ca: there the block
 * zooms up or down as one piece until the pane's width or its height runs
 * out. So the squash tests skip the desktop project, and the last test checks
 * the desktop rule by where the block lands in its pane.
 */

/** What the fit did: its scale, how much width it gave up, and the tail's share. */
async function paid(page: Page) {
  return page.evaluate(() => {
    const pane = [...document.querySelectorAll<HTMLElement>('[data-lg-viewport]')]
      .filter((vp) => !vp.hasAttribute('inert'))[0];
    const fit = pane.querySelector<HTMLElement>('div[style*="zoom"]')!;
    const scale = Number(getComputedStyle(fit).zoom);
    const box = fit.getBoundingClientRect();
    const tail = fit.querySelector<HTMLElement>('[data-fit-tail]')!;
    const host = fit.parentElement!;
    const pad = getComputedStyle(host);
    const room = host.clientWidth
      - (parseFloat(pad.paddingLeft) || 0)
      - (parseFloat(pad.paddingRight) || 0);
    const natural = box.height / scale;
    const body = natural - tail.getBoundingClientRect().height / scale;
    return { scale, kept: box.width / room, body: body / natural };
  });
}

const settle = (page: Page) => page.waitForTimeout(900);

/** Tall enough that nothing has to shrink, and short enough that it does. */
const ROOMY = 1400;
const TIGHT = 700;

test.describe('the fit', { tag: '@viewport' }, () => {
  test.beforeEach(() => {
    test.skip(
      test.info().project.name === 'desktop',
      'desktop grows the block uniformly instead of squashing it (a34b5dd9, f2676ee5; merged in 07a820ca)',
    );
  });

  test('pays for the summary\'s hints out of both sides, and the rest out of height',
    async ({ page }, testInfo) => {
      test.skip(
        testInfo.project.name === 'desktop',
        'desktop uses uniform grow-fit; its fit math and pane overflow have separate coverage',
      );
      const { width } = page.viewportSize()!;
      await page.setViewportSize({ width, height: ROOMY });
      await page.goto('/custom-gym-leader');
      await page.waitForSelector('[data-testid="league-slot-0"]');
      await settle(page);
      const roomy = await paid(page);
      expect(roomy.scale, 'a tall viewport needs no fit').toBeGreaterThan(0.97);
      expect(roomy.kept, 'so the block keeps the whole pane').toBeCloseTo(1, 2);

      await page.setViewportSize({ width, height: TIGHT });
      await settle(page);
      const tight = await paid(page);
      expect(tight.scale, 'a short one needs the fit').toBeLessThan(0.95);
      expect(tight.scale, 'without hitting the floor, where this stops holding').toBeGreaterThan(0.57);
      // The card kept its width; the hints bought theirs from both sides.
      expect(tight.kept, 'the width given up is the tail\'s share').toBeCloseTo(tight.body, 2);
      expect(tight.kept, 'and it is the tail only, not the card').toBeGreaterThan(0.9);
    });

  test('pays for a gym card the same way', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'desktop',
      'desktop uses uniform grow-fit; its fit math and pane overflow have separate coverage',
    );
    const { width } = page.viewportSize()!;
    await page.setViewportSize({ width, height: TIGHT });
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await settle(page);
    const tight = await paid(page);
    expect(tight.scale, 'a short viewport needs the fit').toBeLessThan(0.95);
    expect(tight.scale, 'without hitting the floor').toBeGreaterThan(0.57);
    expect(tight.kept, 'the width given up is the tail\'s share').toBeCloseTo(tight.body, 2);
  });
});

/**
 * Where the fitted block sits in each pane on screen.
 *
 * `spareLeft` and `spareRight` are the pane width it leaves unused on each
 * side, and `spareBelow` is the height between the lowest thing it paints and
 * the fold. A negative number is a spill: the block drawn past its pane, where
 * nothing can be pressed or read.
 */
async function placement(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-lg-viewport]')]
      .filter((vp) => !vp.hasAttribute('inert'))
      .map((vp) => {
        const fit = vp.querySelector<HTMLElement>('div[style*="zoom"]')!;
        const host = fit.parentElement!;
        const pad = getComputedStyle(host);
        const h = host.getBoundingClientRect();
        const box = fit.getBoundingClientRect();
        let lowest = -Infinity;
        for (const el of fit.querySelectorAll<HTMLElement>('*')) {
          const r = el.getBoundingClientRect();
          if (r.width >= 1 && r.height >= 1) lowest = Math.max(lowest, r.bottom);
        }
        return {
          spareLeft: box.left - (h.left + (parseFloat(pad.paddingLeft) || 0)),
          spareRight: h.right - (parseFloat(pad.paddingRight) || 0) - box.right,
          spareBelow: vp.getBoundingClientRect().bottom - lowest,
        };
      }),
  );
}

/**
 * The height a desktop block may leave empty under itself and still count as
 * filling its pane: the gap the fit keeps below the block to match the one
 * above it (measured 17 to 20px), plus the fit's 20px measurement deadband.
 */
const FILLED = 48;

test.describe('the desktop fit', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop', 'phones squash instead; see "the fit" above');
  });

  test('grows until the pane runs out of width or height, and spills over neither',
    async ({ page }) => {
      const { width } = page.viewportSize()!;
      await page.setViewportSize({ width, height: ROOMY });
      await page.goto('/custom-gym-leader');
      await page.waitForSelector('[data-testid="league-slot-0"]');
      await settle(page);
      // A tall pane runs out of width first, so the block fills it edge to edge.
      for (const pane of await placement(page)) {
        expect(Math.abs(pane.spareLeft), 'a tall pane is filled to its left edge').toBeLessThan(1);
        expect(Math.abs(pane.spareRight), 'and to its right edge').toBeLessThan(1);
        expect(pane.spareBelow, 'with nothing past the fold').toBeGreaterThanOrEqual(0);
      }

      // A short pane runs out of height first, so the block fills that instead
      // and sits centred in the width it does not need.
      await page.setViewportSize({ width, height: TIGHT });
      await settle(page);
      for (const pane of await placement(page)) {
        expect(pane.spareBelow, 'a short pane has nothing past the fold').toBeGreaterThanOrEqual(0);
        expect(pane.spareBelow, 'and no band of empty pane under the block').toBeLessThan(FILLED);
        expect(pane.spareLeft, 'nothing spills off the left').toBeGreaterThan(-1);
        expect(pane.spareRight, 'or the right').toBeGreaterThan(-1);
        expect(Math.abs(pane.spareLeft - pane.spareRight), 'the block is centred').toBeLessThan(2);
      }
    });

  test('fits a gym card and the league beside it the same way', async ({ page }) => {
    const { width } = page.viewportSize()!;
    await page.setViewportSize({ width, height: TIGHT });
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await settle(page);
    const panes = await placement(page);
    expect(panes.length, 'the league and the card are both on screen').toBe(2);
    for (const pane of panes) {
      expect(pane.spareBelow, 'nothing past the fold').toBeGreaterThanOrEqual(0);
      expect(pane.spareBelow, 'and no band of empty pane under the block').toBeLessThan(FILLED);
      expect(pane.spareLeft, 'nothing spills off the left').toBeGreaterThan(-1);
      expect(pane.spareRight, 'or the right').toBeGreaterThan(-1);
    }
  });
});
