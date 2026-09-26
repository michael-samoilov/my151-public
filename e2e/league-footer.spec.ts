import { expect, test, type Page } from '@playwright/test';

/**
 * Every league surface carries the app footer just below its fold.
 *
 * Mobile keeps one footer in each sliding pane. Desktop keeps one footer below
 * the complete pane row, so opening a card does not move or duplicate it.
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

/** Each active scrolling surface, with its footer position relative to the fold. */
async function footers(page: Page) {
  return page.evaluate(() => {
    const panes = [...document.querySelectorAll<HTMLElement>('[data-lg-viewport]')]
      .filter((vp) => !vp.hasAttribute('inert'));
    const credit = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('span')].find((span) =>
      (span.textContent ?? '').includes('Nintendo / Game Freak'));
    const paneFooters = panes.map((pane) => ({ pane, foot: credit(pane) }));
    if (paneFooters.some(({ foot }) => foot)) {
      return paneFooters.map(({ pane, foot }) => ({
        hasFooter: Boolean(foot),
        belowFold: foot ? foot.getBoundingClientRect().top - pane.getBoundingClientRect().bottom : NaN,
      }));
    }

    const foot = credit(document);
    let surface = panes[0]?.parentElement ?? null;
    while (surface && foot && !surface.contains(foot)) surface = surface.parentElement;
    return [{
      hasFooter: Boolean(foot && surface),
      belowFold: foot && surface
        ? foot.getBoundingClientRect().top - surface.getBoundingClientRect().bottom
        : NaN,
    }];
  });
}

test.describe('the league footer', () => {
  test('the summary carries it, just below the fold', async ({ page }) => {
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.waitForTimeout(700);
    const panes = await footers(page);
    expect(panes.length, 'at least one pane on screen').toBeGreaterThan(0);
    for (const pane of panes) {
      expect(pane.hasFooter, 'the active surface carries the app footer').toBe(true);
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

  test('a gym card carries it too', async ({ page }) => {
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(800);
    const panes = await footers(page);
    expect(panes.length, 'at least one pane on screen').toBeGreaterThan(0);
    for (const pane of panes) {
      expect(pane.hasFooter, 'the active surface carries the app footer').toBe(true);
      expect(pane.belowFold, 'and it starts at or below the fold').toBeGreaterThan(-1);
      expect(pane.belowFold, 'without a gap reserved above it').toBeLessThan(120);
    }
  });
});
