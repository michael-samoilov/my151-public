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

test.describe('the fit', () => {
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
      // The card kept its width; the hints bought theirs from both sides.
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
