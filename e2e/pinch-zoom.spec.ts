import { expect, test, type Page } from '@playwright/test';

/**
 * A pinch has to work anywhere on the app body.
 *
 * `touch-action: none` on an element hands every touch over it to the app,
 * and that takes the browser's own gestures with it — a two-finger zoom that
 * starts over such an element simply does not happen. The league surfaces set
 * it on every row and every card cell, which is most of both pages, so the
 * gesture worked or not depending on where the fingers landed.
 *
 * They no longer need it: a touch has to press and hold before the drag
 * sensor claims the gesture, so a pinch is over before there is anything to
 * claim. This asserts the property rather than the fix, so it also catches
 * the next surface that reaches for `none`.
 */

/** Painted elements whose computed touch-action refuses a pinch. */
async function pinchBlockers(page: Page) {
  return page.evaluate(() => {
    const bad: Array<{ id: string; touchAction: string; area: number }> = [];
    for (const el of document.querySelectorAll<HTMLElement>('*')) {
      const ta = getComputedStyle(el).touchAction;
      // `auto` and anything naming pinch-zoom keep the gesture. `none` and
      // `manipulation` both drop it.
      if (ta === 'auto' || ta.includes('pinch-zoom')) continue;
      const r = el.getBoundingClientRect();
      // A sliver is not somewhere a person puts two fingers. Sheet grab
      // handles are deliberately `none` and are far below this.
      if (r.width * r.height < 4000) continue;
      bad.push({
        id: el.getAttribute('data-testid') ?? `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`,
        touchAction: ta,
        area: Math.round(r.width * r.height),
      });
    }
    return bad.sort((a, b) => b.area - a.area);
  });
}

test.describe('pinch to zoom', () => {
  test('nothing large on the league summary swallows it', async ({ page }) => {
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.waitForTimeout(500);
    expect(await pinchBlockers(page)).toEqual([]);
  });

  test('nothing large on a gym card swallows it', async ({ page }) => {
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(600);
    expect(await pinchBlockers(page)).toEqual([]);
  });

  test('nothing large on the dex builder swallows it', async ({ page }) => {
    await page.goto('/pokedex-builder');
    await page.waitForTimeout(1200);
    expect(await pinchBlockers(page)).toEqual([]);
  });
});
