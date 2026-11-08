import { expect, test, type Page } from './support/test';

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
    async ({ page }) => {
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
      expect(tight.kept, 'the width given up is the tail\'s share').toBeCloseTo(tight.body, 2);
      expect(tight.kept, 'and it is the tail only, not the card').toBeGreaterThan(0.9);
    });

  test('pays for a gym card the same way', async ({ page }) => {
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
      for (const pane of await placement(page)) {
        expect(Math.abs(pane.spareLeft), 'a tall pane is filled to its left edge').toBeLessThan(1);
        expect(Math.abs(pane.spareRight), 'and to its right edge').toBeLessThan(1);
        expect(pane.spareBelow, 'with nothing past the fold').toBeGreaterThanOrEqual(0);
      }

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
