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

/**
 * The lowest thing each visible pane actually paints, relative to its fold.
 *
 * Every descendant, not the fitted block's own box. The block's box can lie:
 * the summary's hint lines sat in a container with a written-down height that
 * left its own top padding out, so the block measured 29px while it painted
 * 37. The fit believed the box, ended the card 8px above its last line, and
 * the phone cropped "Tap a row to open its trainer card" in half.
 */
async function lowestPainted(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-lg-viewport]')]
      .filter((vp) => !vp.hasAttribute('inert'))
      .map((vp) => {
        const fit = vp.querySelector<HTMLElement>('div[style*="zoom"]');
        if (!fit) return { found: false, belowFold: NaN, text: '' };
        let low = { bottom: -Infinity, text: '' };
        for (const el of fit.querySelectorAll<HTMLElement>('*')) {
          const r = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          if (r.width < 1 || r.height < 1) continue;
          if (style.visibility === 'hidden' || style.opacity === '0') continue;
          if (r.bottom > low.bottom) low = { bottom: r.bottom, text: (el.textContent ?? '').trim().slice(0, 40) };
        }
        return { found: true, belowFold: low.bottom - vp.getBoundingClientRect().bottom, text: low.text };
      }),
  );
}

/** Each scrolling pane, with where its footer starts relative to the fold. */
async function footers(page: Page) {
  return page.evaluate(() => {
    const panes = [...document.querySelectorAll<HTMLElement>('[data-lg-viewport]')]
      // Only the pane actually on screen; the mobile shell keeps both mounted.
      .filter((vp) => !vp.hasAttribute('inert'));

    // Desktop deliberately has one stable page footer below the whole pane
    // row. Mobile gives each independently scrolling pane its own footer.
    if (window.matchMedia('(min-width: 1024px)').matches) {
      const globalFooters = [...document.querySelectorAll<HTMLElement>('span')].filter((el) =>
        (el.textContent ?? '').includes('Nintendo / Game Freak')
        && panes.every((pane) => !pane.contains(el)));
      const fold = Math.max(...panes.map((pane) => pane.getBoundingClientRect().bottom));
      return [{
        hasFooter: globalFooters.length === 1,
        belowFold: globalFooters[0]
          ? globalFooters[0].getBoundingClientRect().top - fold
          : NaN,
      }];
    }

    return panes.map((vp) => {
        const foot = [...vp.querySelectorAll<HTMLElement>('div')].find((d) =>
          (d.textContent ?? '').includes('Nintendo / Game Freak'));
        if (!foot) return { hasFooter: false, belowFold: NaN };
        const v = vp.getBoundingClientRect();
        return { hasFooter: true, belowFold: foot.getBoundingClientRect().top - v.bottom };
      });
  });
}

test.describe('the league footer', () => {
  test('the summary puts it just below the fold', async ({ page }) => {
    await page.goto('/custom-gym-leader');
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

  test('the summary paints nothing below its own fold', async ({ page }) => {
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.waitForTimeout(700);
    const panes = await lowestPainted(page);
    expect(panes.length, 'at least one pane on screen').toBeGreaterThan(0);
    for (const pane of panes) {
      expect(pane.found, 'the pane has a fitted block').toBe(true);
      expect(pane.belowFold, `"${pane.text}" is cut off by the fold`).toBeLessThanOrEqual(0);
    }
  });

  test('a gym card paints nothing below its own fold', async ({ page }) => {
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(800);
    const panes = await lowestPainted(page);
    expect(panes.length, 'at least one pane on screen').toBeGreaterThan(0);
    for (const pane of panes) {
      expect(pane.found, 'the pane has a fitted block').toBe(true);
      expect(pane.belowFold, `"${pane.text}" is cut off by the fold`).toBeLessThanOrEqual(0);
    }
  });

  test('a gym card keeps it there too', async ({ page }) => {
    await page.goto('/custom-gym-leader');
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
