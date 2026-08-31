import { expect, test, type Page } from '@playwright/test';

/**
 * Every league pane carries the app footer, just below its own fold.
 *
 * The dex builder's panes already do this: the footer goes after the fitted
 * block and is not reserved in the fit, so the block takes the whole viewport
 * and the footer starts exactly where it ends. A reader who never scrolls
 * never sees it; a reader who does finds it immediately.
 *
 * Both halves of that matter. A footer *above* the fold means the page did not
 * fill the viewport; a footer far below it means something reserved room it
 * should not have.
 */

/** Each scrolling pane, with where its footer starts relative to the fold. */
async function footers(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-lg-viewport]')]
      // Only the pane actually on screen; the mobile shell keeps both mounted.
      .filter((vp) => !vp.hasAttribute('inert'))
      .map((vp) => {
        const foot = [...vp.querySelectorAll<HTMLElement>('div')].find((d) =>
          (d.textContent ?? '').includes('Nintendo / Game Freak'));
        if (!foot) return { hasFooter: false, belowFold: NaN };
        const v = vp.getBoundingClientRect();
        return { hasFooter: true, belowFold: foot.getBoundingClientRect().top - v.bottom };
      }),
  );
}

test.describe('the league footer', () => {
  test('the summary carries it, just below the fold', async ({ page }) => {
    await page.goto('/pokemon-league-builder');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.waitForTimeout(700);
    const panes = await footers(page);
    expect(panes.length, 'at least one pane on screen').toBeGreaterThan(0);
    for (const pane of panes) {
      expect(pane.hasFooter, 'the pane carries the app footer').toBe(true);
      expect(pane.belowFold, 'and it starts at or below the fold').toBeGreaterThan(-1);
      expect(pane.belowFold, 'without a gap reserved above it').toBeLessThan(120);
    }
  });

  test('a gym card carries it too', async ({ page }) => {
    await page.goto('/pokemon-league-builder');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(800);
    const panes = await footers(page);
    expect(panes.length, 'at least one pane on screen').toBeGreaterThan(0);
    for (const pane of panes) {
      expect(pane.hasFooter, 'the pane carries the app footer').toBe(true);
      expect(pane.belowFold, 'and it starts at or below the fold').toBeGreaterThan(-1);
      expect(pane.belowFold, 'without a gap reserved above it').toBeLessThan(120);
    }
  });
});
