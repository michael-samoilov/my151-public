import { expect, test, type Page } from '@playwright/test';

/**
 * Every league surface carries the app footer, just below its own fold.
 *
 * The dex builder's panes already do this: the footer goes after the fitted
 * block and is not reserved in the fit, so the block takes the whole viewport
 * and the footer starts exactly where it ends. A reader who never scrolls
 * never sees it; a reader who does finds it immediately.
 *
 * The phone keeps one footer at the end of each sliding pane. Desktop keeps
 * one slim footer under the whole pane row, on purpose since f2676ee5 (merged
 * in 07a820ca), so the cards get the height two per-pane footers used to
 * reserve. The contract below holds for both: whatever scrolls, its footer
 * starts at its fold.
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

/**
 * Each scroller on screen that ends in the app footer, with where the footer
 * starts relative to that scroller's fold.
 *
 * The footer is the scroller's own child that holds the credit line: the
 * footer itself at the end of a phone pane, the bar under the pane row on
 * desktop. `panesCovered` says whether every pane on screen scrolls inside
 * one of these, so a pane that lost its footer cannot pass unnoticed.
 */
async function footers(page: Page) {
  return page.evaluate(() => {
    const scrollsY = (el: HTMLElement) => /^(auto|scroll)$/.test(getComputedStyle(el).overflowY);
    // Only what is on screen; the phone shell keeps both panes mounted.
    const credits = [...document.querySelectorAll<HTMLElement>('span')].filter(
      (span) => (span.textContent ?? '').includes('Nintendo / Game Freak') && !span.closest('[inert]'),
    );
    const found = credits.flatMap((credit) => {
      let block: HTMLElement = credit;
      let scroller = credit.parentElement;
      while (scroller && !scrollsY(scroller)) {
        block = scroller;
        scroller = scroller.parentElement;
      }
      return scroller ? [{ scroller, block }] : [];
    });
    const panes = [...document.querySelectorAll<HTMLElement>('[data-lg-viewport]')]
      .filter((vp) => !vp.hasAttribute('inert'));
    return {
      panesCovered:
        panes.length > 0 && panes.every((vp) => found.some(({ scroller }) => scroller.contains(vp))),
      belowFold: found.map(({ scroller, block }) =>
        block.getBoundingClientRect().top - scroller.getBoundingClientRect().bottom),
    };
  });
}

/** The footer contract, the same on every surface. */
async function expectFooterAtFold(page: Page) {
  const { panesCovered, belowFold } = await footers(page);
  expect(panesCovered, 'every pane on screen scrolls to the app footer').toBe(true);
  for (const top of belowFold) {
    expect(top, 'and it starts at or below the fold').toBeGreaterThan(-1);
    expect(top, 'without a gap reserved above it').toBeLessThan(120);
  }
}

test.describe('the league footer', { tag: '@viewport' }, () => {
  test('the summary carries it, just below the fold', async ({ page }) => {
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.waitForTimeout(700);
    await expectFooterAtFold(page);
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
    await expectFooterAtFold(page);
  });
});
