import { expect, test, type Page } from '@playwright/test';

/**
 * The fit is a scale, not a squash.
 *
 * The card and the summary shrink to fit a short viewport. What that has to
 * mean is a scale model: the same drawing, smaller. CSS `zoom` alone does not
 * give that, because a block left to fill its parent is sized as a percentage
 * of the *zoomed* coordinate space — so at 0.55 it lays out twice as wide and
 * renders at the width it always had, losing only height. The card went from
 * 369 x 707 to 369 x 389 that way: rows fell from 44px to 24px while the
 * columns stayed 39px, and the sprites went from touching their neighbours to
 * floating in a third of a column.
 *
 * So the check is the aspect ratio, at a viewport tall enough to need no fit
 * and one short enough to need a lot of it.
 */

/** The fitted block's rendered shape, and the scale it was drawn at. */
async function shape(page: Page) {
  return page.evaluate(() => {
    const pane = [...document.querySelectorAll<HTMLElement>('[data-lg-viewport]')]
      .filter((vp) => !vp.hasAttribute('inert'))[0];
    const fit = pane.querySelector<HTMLElement>('div[style*="zoom"]')!;
    const card = fit.firstElementChild!.getBoundingClientRect();
    return {
      scale: Number(getComputedStyle(fit).zoom),
      aspect: card.width / card.height,
      width: card.width,
    };
  });
}

const settle = (page: Page) => page.waitForTimeout(900);

test.describe('the fit', () => {
  test('scales the summary instead of squashing it', async ({ page }) => {
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.width, height: 1400 });
    await page.goto('/pokemon-league-builder');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await settle(page);
    const full = await shape(page);

    await page.setViewportSize({ width: size.width, height: 520 });
    await settle(page);
    const fitted = await shape(page);

    expect(full.scale, 'a tall viewport needs no fit').toBeGreaterThan(0.97);
    expect(fitted.scale, 'a short one needs a lot of it').toBeLessThan(0.9);
    expect(fitted.aspect, 'the same drawing, smaller').toBeCloseTo(full.aspect, 2);
    expect(fitted.width, 'so it gives up width along with height').toBeLessThan(full.width);
  });

  test('scales a gym card the same way', async ({ page }) => {
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.width, height: 1400 });
    await page.goto('/pokemon-league-builder');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await settle(page);
    const full = await shape(page);

    await page.setViewportSize({ width: size.width, height: 520 });
    await settle(page);
    const fitted = await shape(page);

    expect(fitted.scale, 'a short viewport needs the fit').toBeLessThan(0.9);
    expect(fitted.aspect, 'the same drawing, smaller').toBeCloseTo(full.aspect, 2);
  });
});
