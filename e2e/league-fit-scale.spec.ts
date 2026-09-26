import { expect, test, type Page } from '@playwright/test';

/**
 * How the fit pays for the room it needs.
 *
 * Mobile squashes the card to preserve wide touch targets. Its hint lines use
 * uniform scaling, so they take room from both sides. Desktop uses uniform
 * growth from a fixed rem width, which keeps every card proportion stable.
 *
 * These measurements keep both platform contracts explicit.
 */

/** Measure the shared fit values and each platform-specific width contract. */
async function paid(page: Page, targetSelector = '[data-testid="league-slot-0"]') {
  return page.evaluate((selector) => {
    const pane = document.querySelector<HTMLElement>(selector)?.closest<HTMLElement>('[data-lg-viewport]');
    if (!pane) throw new Error(`No fit pane contains ${selector}`);
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
    const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const layoutWidth = parseFloat(getComputedStyle(fit).width);
    return {
      scale,
      kept: box.width / room,
      body: body / natural,
      layoutWidthRem: layoutWidth / rootFont,
      renderedScale: box.width / layoutWidth,
      fitsWidth: box.width <= room + 1,
    };
  }, targetSelector);
}

const settle = (page: Page) => page.waitForTimeout(900);

/** Tall enough that nothing has to shrink, and short enough that it does. */
const ROOMY = 1400;
const TIGHT = 700;

test.describe('the fit', () => {
  test('fits the summary by the active platform contract',
    async ({ page }, testInfo) => {
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
      if (testInfo.project.name === 'desktop') {
        expect(tight.layoutWidthRem, 'desktop keeps the 26rem design width').toBeCloseTo(26, 1);
        expect(tight.renderedScale, 'desktop scales both dimensions together').toBeCloseTo(tight.scale, 2);
        expect(tight.fitsWidth, 'desktop stays inside its pane').toBe(true);
      } else {
        expect(tight.kept, 'the width given up is the tail\'s share').toBeCloseTo(tight.body, 2);
        expect(tight.kept, 'and it is the tail only, not the card').toBeGreaterThan(0.9);
      }
    });

  test('fits a gym card by the active platform contract', async ({ page }, testInfo) => {
    const { width } = page.viewportSize()!;
    await page.setViewportSize({ width, height: TIGHT });
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await settle(page);
    const tight = await paid(page, '[data-testid="card-cell-1-1"]');
    expect(tight.scale, 'a short viewport needs the fit').toBeLessThan(0.95);
    expect(tight.scale, 'without hitting the floor').toBeGreaterThan(0.57);
    if (testInfo.project.name === 'desktop') {
      expect(tight.layoutWidthRem, 'desktop keeps the 26rem design width').toBeCloseTo(26, 1);
      expect(tight.renderedScale, 'desktop scales both dimensions together').toBeCloseTo(tight.scale, 2);
      expect(tight.fitsWidth, 'desktop stays inside its pane').toBe(true);
    } else {
      expect(tight.kept, 'the width given up is the tail\'s share').toBeCloseTo(tight.body, 2);
    }
  });
});
