import { expect, test, type Page } from '@playwright/test';

/**
 * Every overlay the league builder opens has to land on the viewport.
 *
 * They are all `position: fixed`, and a transformed ancestor becomes the
 * containing block for fixed descendants — so the moment the mobile shell
 * became one translated two-pane track, the type picker anchored to the
 * 200%-wide track and spanned both panes. The pickers are portalled out of
 * the tree now, and this spec is what keeps them there: it measures each
 * open overlay against the window rather than trusting the DOM shape.
 */

const seatLine = async (page: Page, query: string) => {
  await page.click('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(600);
  await page.evaluate((q) => {
    const inputs = [...document.querySelectorAll('input')];
    const el = inputs[inputs.length - 1];
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setValue.call(el, q);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, query);
  await page.waitForTimeout(600);
  await page.click('[data-testid="verify-evo-card"]');
  await page.waitForTimeout(400);
};

/** The widest painted box under the given root, in client pixels. */
async function overlayExtent(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const anchor = document.querySelector(sel)!;
    // Walk up to the outermost fixed ancestor: that is the overlay's own root.
    let node: HTMLElement | null = anchor as HTMLElement;
    let root: HTMLElement = anchor as HTMLElement;
    while (node) {
      if (getComputedStyle(node).position === 'fixed') root = node;
      node = node.parentElement;
    }
    const r = root.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width, vw: window.innerWidth };
  }, selector);
}

test.describe('league overlays', () => {
  test('every picker opens onto the viewport, not the pane track', async ({ page }) => {
    await page.goto('/pokemon-league-builder');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    // The pane track finishes its translate before anything is measured.
    await page.waitForTimeout(500);

    const inside = (box: { left: number; right: number; vw: number }, what: string) => {
      expect(box.left, `${what} starts left of the viewport`).toBeGreaterThanOrEqual(-1);
      expect(box.right, `${what} runs past the viewport`).toBeLessThanOrEqual(box.vw + 1);
    };

    // 1. The type picker.
    await page.click('[aria-label="Gym type"]');
    await page.waitForSelector('svg[aria-label="No type"]');
    inside(await overlayExtent(page, 'svg[aria-label="No type"]'), 'the type picker');
    await page.click('svg[data-type="water"]');
    await page.waitForTimeout(300);

    // 2. The selection pane, reached from an empty cell.
    await page.click('[data-testid="card-cell-1-1"]');
    await page.waitForSelector('[data-filter-chip="my-dex"]');
    inside(await overlayExtent(page, '[data-filter-chip="my-dex"]'), 'the selection pane');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // 3. The TM picker.
    await page.click('text=Pick a move');
    await page.waitForSelector('[data-testid="tm-filter-category"]');
    inside(await overlayExtent(page, '[data-testid="tm-filter-category"]'), 'the TM picker');
  });

  test('seating a line leaves the card inside the viewport', async ({ page }) => {
    await page.goto('/pokemon-league-builder');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(500);
    await seatLine(page, 'chinchou');
    const scroll = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.innerWidth + 2);
  });
});
