import { expect, test, type Page } from '@playwright/test';
import { seedDex, TUNE_URL } from './support/dexSeed';
import { blankLeague } from './support/leagueSeed';

/**
 * One drag treatment, four surfaces.
 *
 * The dex builder, the view page, the league summary and the gym card each
 * had their own idea of what "holding something" looks like — a faded source
 * here, a scaled-and-ringed target there. They now share
 * `src/components/shared/dragHold.tsx`, and this is what keeps them sharing
 * it: the same two measurements on all four, taken mid-drag.
 */

const DRAG_SOURCE_OPACITY = 0.25;

/** What the page shows mid-drag: the held copy, and whatever receded. */
async function holdState(page: Page) {
  return page.evaluate(() => {
    const receded = [...document.querySelectorAll<HTMLElement>('*')].filter((el) => {
      const o = parseFloat(getComputedStyle(el).opacity);
      return o > 0.2 && o < 0.3;
    });
    return {
      held: document.querySelectorAll('[data-drag-held]').length,
      recededCount: receded.length,
      opacity: receded.length ? Number(parseFloat(getComputedStyle(receded[0]).opacity).toFixed(2)) : null,
    };
  });
}

/** Grab something, move, and read the page without letting go. */
async function midDrag(page: Page, selector: string, dx: number, dy: number) {
  const target = page.locator(selector).first();
  // A seeded dex is taller than the window, and a grab at coordinates the
  // pointer cannot reach starts no drag at all.
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // The touch projects arm their sensor on a 250ms hold, so the grab has to
  // last before it travels.
  await page.waitForTimeout(350);
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.waitForTimeout(250);
  const state = await holdState(page);
  await page.mouse.up();
  await page.waitForTimeout(200);
  return state;
}

const carries = (state: { held: number; opacity: number | null }, what: string) => {
  expect(state.held, `${what}: exactly one held copy`).toBe(1);
  expect(state.opacity, `${what}: the source recedes`).toBe(DRAG_SOURCE_OPACITY);
};

test.describe('drag hold', () => {
  // Desktop only, and for a harness reason rather than a product one: the
  // touch projects arm dnd-kit's TouchSensor, which wants real touch events,
  // and Playwright's `mouse` API emits mouse events. The dex surfaces drag
  // fine on a phone — this is the one way to grab them that the harness has.
  test('the dex builder and the view page hold the same way', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'mouse-driven drag needs the desktop project');
    await page.goto(TUNE_URL);
    await seedDex(page);
    await page.waitForSelector('[data-tile-id]');
    carries(await midDrag(page, '[data-tile-id]', 140, 0), 'dex builder');

    await page.click('[data-nav="view"]');
    await page.waitForSelector('[data-view-tile]', { timeout: 20000 });
    await page.waitForTimeout(600);
    carries(await midDrag(page, '[data-view-tile]', 120, 0), 'view page');
  });

  test('the league summary and the gym card hold the same way', async ({ page }) => {
    await blankLeague(page);
    await page.goto('/pokemon-league-builder');
    await page.waitForSelector('[data-testid="league-slot-0"]');

    // A held copy is the size of the thing that was grabbed. A row measured
    // too late arrives in hand shrunk to its content, at about half width.
    const row = (await page.locator('[data-testid="league-slot-0"]').boundingBox())!;
    await page.mouse.move(row.x + row.width / 2, row.y + row.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(350);
    await page.mouse.move(row.x + row.width / 2, row.y + row.height / 2 + 120, { steps: 8 });
    await page.waitForTimeout(250);
    const rowState = await holdState(page);
    const heldWidth = await page.evaluate(
      () => document.querySelector('[data-drag-held]')?.firstElementChild?.getBoundingClientRect().width ?? 0,
    );
    await page.mouse.up();
    await page.waitForTimeout(200);
    carries(rowState, 'league rows');
    expect(Math.abs(heldWidth - row.width), 'the held row is the width of the row').toBeLessThan(2);

    await page.click('[data-testid="league-slot-3"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(400);
    for (const [cell, query] of [
      ['[data-testid="card-cell-1-1"]', 'chinchou'],
      ['[data-testid="card-cell-1-2"]', 'lotad'],
    ]) {
      await page.click(cell);
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
    }

    // A column, carried sideways onto the next seat.
    const from = (await page.locator('[data-testid="card-cell-11-1"]').boundingBox())!;
    const to = (await page.locator('[data-testid="card-cell-11-2"]').boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    await page.waitForTimeout(300);
    const column = await holdState(page);
    await page.mouse.up();
    await page.waitForTimeout(200);
    carries(column, 'card columns');
  });

  test('shifting an evolution boundary carries nothing', async ({ page }) => {
    await blankLeague(page);
    await page.goto('/pokemon-league-builder');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-3"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(400);
    await page.click('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input')];
      const el = inputs[inputs.length - 1];
      const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setValue.call(el, 'chinchou');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(600);
    await page.click('[data-testid="verify-evo-card"]');
    await page.waitForTimeout(400);

    // A vertical drag paints a shelf in place. Nothing leaves the card, so
    // nothing should appear in hand.
    const state = await midDrag(page, '[data-testid="card-cell-3-1"]', 0, 120);
    expect(state.held, 'a boundary paint holds nothing').toBe(0);
  });
});
