import { expect, test, type Page } from '@playwright/test';

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

async function footers(page: Page) {
  return page.evaluate(() => {
    const scrollsY = (el: HTMLElement) => /^(auto|scroll)$/.test(getComputedStyle(el).overflowY);
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
