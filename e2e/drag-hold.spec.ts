import { expect, test, type Page } from '@playwright/test';
import { seedDex, TUNE_URL } from './support/dexSeed';
import { blankLeague, seededLeague } from './support/leagueSeed';

/**
 * Where a drag puts things, on four surfaces.
 *
 * One rule decides it: nothing the drop is about sits below the thumb, because
 * a finger hides whatever is under it. The dex pages answer that by lifting
 * the copy and the hit test above the thumb; the league surfaces answer it by
 * putting the copy ON the target and opening the slot underneath. These are
 * the measurements that keep both honest, taken mid-drag.
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

  test('a league row is carried on its slot, and the slot opens', async ({ page }) => {
    await blankLeague(page);
    await page.goto('/pokemon-league-builder');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.waitForTimeout(300);

    const row = (await page.locator('[data-testid="league-slot-2"]').boundingBox())!;
    const x = row.x + row.width / 2;
    const y = row.y + row.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(350);
    await page.mouse.move(x, y - 100, { steps: 8 });
    await page.waitForTimeout(300);
    const state = await page.evaluate(() => {
      const held = document.querySelector('[data-drag-held]')?.firstElementChild?.getBoundingClientRect();
      const slot = document.querySelector('[data-slot-open]')?.getBoundingClientRect();
      return {
        copies: document.querySelectorAll('[data-drag-held]').length,
        slots: document.querySelectorAll('[data-slot-open]').length,
        // The copy sits on the slot, lifted, so the gap reads underneath it.
        lift: held && slot ? Math.round(slot.top - held.top) : null,
        sameWidth: held && slot ? Math.abs(held.width - slot.width) < 3 : false,
      };
    });
    await page.mouse.up();
    await page.waitForTimeout(200);

    expect(state.copies, 'exactly one copy in hand').toBe(1);
    expect(state.slots, 'exactly one open slot').toBe(1);
    expect(state.lift, 'the copy is lifted off the slot it would fill').toBeGreaterThan(6);
    expect(state.sameWidth, 'the copy is the width of the slot').toBe(true);
  });

  test('a gym column is carried in place, with no stack under the thumb', async ({ page }) => {
    await blankLeague(page);
    await page.goto('/pokemon-league-builder');
    await page.waitForSelector('[data-testid="league-slot-0"]');
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

    const from = (await page.locator('[data-testid="card-cell-11-1"]').boundingBox())!;
    const to = (await page.locator('[data-testid="card-cell-11-2"]').boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(350);
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    await page.waitForTimeout(300);
    const state = await page.evaluate(() => {
      const lifted = [...document.querySelectorAll<HTMLElement>('[data-testid^="card-cell-"]')].filter((c) =>
        /matrix\(1, 0, 0, 1, 0, -/.test(getComputedStyle(c).transform),
      );
      return {
        copies: document.querySelectorAll('[data-drag-held]').length,
        openSeats: document.querySelectorAll('[data-seat-open]').length,
        lifted: lifted.length,
      };
    });
    await page.mouse.up();
    await page.waitForTimeout(200);

    // The column IS the preview: it lifts off the card over an open seat.
    // A truncated stack under the thumb showed neither the shape nor the seat.
    expect(state.copies, 'a column carries no overlay').toBe(0);
    expect(state.openSeats, 'the seat under the column opens').toBeGreaterThan(0);
    expect(state.lifted, 'every cell of the column lifts').toBe(state.openSeats);
  });

  test('the legendary is carried on a cell face', async ({ page }) => {
    // The copy in hand wears what a cell wears, so a drag reads the same
    // whether it carries a column or the boss's legendary. A bare sprite on
    // the dark band read as a cutout beside the lifted cells.
    await seededLeague(page);
    await page.goto('/pokemon-league-builder');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.waitForTimeout(400);
    await page.click('[data-testid="league-slot-13"]');
    await page.waitForSelector('[data-testid="card-cell-11-6"]');
    await page.waitForTimeout(900);

    const grab = (await page.locator('[data-testid="card-cell-11-6"]').boundingBox())!;
    await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(350);
    await page.mouse.move(grab.x + grab.width / 2 + 90, grab.y + grab.height / 2 + 12, { steps: 8 });
    await page.waitForTimeout(300);
    const state = await page.evaluate(() => {
      const face = document.querySelector('[data-held-face]');
      const cell = document.querySelector('[data-testid="card-cell-11-1"]')!;
      const f = face?.getBoundingClientRect();
      const c = cell.getBoundingClientRect();
      const fs = face ? getComputedStyle(face) : null;
      return {
        faces: document.querySelectorAll('[data-held-face]').length,
        background: fs?.backgroundColor ?? null,
        shadow: fs?.boxShadow ?? null,
        radius: fs ? parseFloat(fs.borderTopLeftRadius) : null,
        // The card scales itself with CSS `zoom` and the copy is portalled
        // out of it, so matching the cell means matching what it PAINTS. A
        // computed style is the unzoomed value, so the cell's own corner has
        // to be scaled by the zoom the same two numbers reveal.
        widthGap: f ? Math.abs(f.width - c.width) : null,
        heightGap: f ? Math.abs(f.height - c.height) : null,
        cellRadius:
          parseFloat(getComputedStyle(cell).borderTopLeftRadius)
          * (c.height / parseFloat(getComputedStyle(cell).height)),
      };
    });
    await page.mouse.up();
    await page.waitForTimeout(200);

    expect(state.faces, 'exactly one face in hand').toBe(1);
    expect(state.background, 'the face is white, like a cell').toBe('rgb(255, 255, 255)');
    expect(state.shadow, 'the face carries the lift shadow').toContain('rgba(15, 23, 42, 0.28)');
    expect(
      Math.abs((state.radius ?? 0) - state.cellRadius),
      "the face's corner is the cell's",
    ).toBeLessThan(0.5);
    expect(state.widthGap, 'the face is the width of a cell').toBeLessThan(1);
    expect(state.heightGap, 'the face is the height of a cell').toBeLessThan(1);
  });

  test('a column reorder paints the line it carries, not the seat it lands on', async ({ page }) => {
    // A reorder swaps `src` on cells that are already on screen, and a
    // browser that does not have the new bitmap keeps painting the old one.
    // Moving a line to a deeper seat reveals stages no row showed before, so
    // the column under the pointer read as its previous tenant until each
    // sprite arrived. Measured on the built preview, seven cards showed 19
    // such cells before the card started warming every member it can draw.
    await seededLeague(page);
    await page.goto('/pokemon-league-builder');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.waitForTimeout(400);
    await page.click('[data-testid="league-slot-12"]');
    await page.waitForSelector('[data-testid="card-cell-10-1"]');
    await page.waitForTimeout(1200);

    await page.evaluate(() => {
      (window as unknown as { __cold: string[] }).__cold = [];
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          const img = record.target;
          if (!(img instanceof HTMLImageElement)) continue;
          if (img.complete && img.naturalWidth > 0) continue;
          const cell = img.closest('[data-testid^="card-cell-"]');
          (window as unknown as { __cold: string[] }).__cold.push(
            `${cell?.getAttribute('data-testid') ?? '?'} <- ${img.getAttribute('src')}`,
          );
        }
      });
      observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['src'] });
      (window as unknown as { __obs: MutationObserver }).__obs = observer;
    });

    // Seat 6 reaches only the last two rows; seat 1 reaches all eleven.
    const from = (await page.locator('[data-testid="card-cell-10-6"]').boundingBox())!;
    const to = (await page.locator('[data-testid="card-cell-10-1"]').boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(350);
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await page.waitForTimeout(400);
    const cold = await page.evaluate(() => {
      (window as unknown as { __obs: MutationObserver }).__obs.disconnect();
      return (window as unknown as { __cold: string[] }).__cold;
    });
    await page.mouse.up();
    await page.waitForTimeout(200);

    expect(cold, 'every sprite the drag reveals is already decoded').toEqual([]);
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
