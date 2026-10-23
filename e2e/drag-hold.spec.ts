import { expect, test, type Page } from '@playwright/test';
import { seedDex, TUNE_URL } from './support/dexSeed';
import { blankLeague, seededLeague, sevenGymsLeague } from './support/leagueSeed';

const DRAG_SOURCE_OPACITY = 0.25;

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

async function midDrag(page: Page, selector: string, dx: number, dy: number) {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
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

  test('a league row is carried in the slot it would fill', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'mouse-driven drag needs the desktop project');
    await sevenGymsLeague(page);
    await page.goto('/custom-gym-leader');
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
      const copy = document.querySelector('[data-drag-held]');
      if (!copy) return { copies: 0 };
      const slot = copy.closest('[data-testid^="league-slot-"]')!;
      const c = copy.getBoundingClientRect();
      const s = slot.getBoundingClientRect();
      return {
        copies: document.querySelectorAll('[data-drag-held]').length,
        offCentre: Math.abs((c.top + c.height / 2) - (s.top + s.height / 2)),
        heightRatio: c.height / s.height,
      };
    });
    await page.mouse.up();
    await page.waitForTimeout(200);

    expect(state.copies, 'exactly one row in hand').toBe(1);
    expect(state.offCentre!, 'the copy is centred in its slot').toBeLessThan(1.5);
    expect(state.heightRatio!, 'and smaller than the slot').toBeLessThan(0.95);
    expect(state.heightRatio!, 'but still a row').toBeGreaterThan(0.6);
  });

  test('a gym column is carried in place, with no stack under the thumb', async ({ page }) => {
    await blankLeague(page);
    await page.goto('/custom-gym-leader');
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

    expect(state.copies, 'a column carries no overlay').toBe(0);
    expect(state.openSeats, 'the seat under the column opens').toBeGreaterThan(0);
    expect(state.lifted, 'every cell of the column lifts').toBe(state.openSeats);
  });

  test('a press and hold picks things up, it does not select them', async ({ page }) => {
    // On iOS a long press is both "pick this up" and "start a selection", and
    // the selection wins: the league summary answered a press-and-hold with a
    // Copy / Search callout across two rows. The callout itself is device-only
    // — what a browser here can be asked is whether the surface is selectable
    // at all, which is the property that decides it.
    const audit = () =>
      page.evaluate(() => {
        const bad: string[] = [];
        const draggables = [...document.querySelectorAll<HTMLElement>('[aria-roledescription="draggable"]')];
        for (const el of draggables) {
          if (getComputedStyle(el).userSelect !== 'none') {
            bad.push(`${el.getAttribute('data-testid') ?? el.tagName.toLowerCase()}: user-select is not none`);
            continue;
          }
          const selection = window.getSelection();
          if (!selection) continue;
          selection.removeAllRanges();
          selection.selectAllChildren(el);
          const text = selection.toString().trim();
          selection.removeAllRanges();
          if (text.length > 0) {
            bad.push(`${el.getAttribute('data-testid') ?? el.tagName.toLowerCase()}: selected "${text.slice(0, 24)}"`);
          }
        }
        return { count: draggables.length, bad };
      });

    await seededLeague(page);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.waitForTimeout(600);
    const home = await audit();
    expect(home.count, 'the summary has draggable rows').toBeGreaterThan(0);
    expect(home.bad, 'league summary').toEqual([]);

    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(600);
    const card = await audit();
    expect(card.count, 'the card has draggable cells').toBeGreaterThan(0);
    expect(card.bad, 'gym card').toEqual([]);

    await page.goto(TUNE_URL);
    await seedDex(page);
    await page.waitForSelector('[data-tile-id]');
    await page.waitForTimeout(400);
    expect((await audit()).bad, 'dex builder').toEqual([]);
  });

  test('the legendary is carried on a cell face', { tag: '@viewport' }, async ({ page }) => {
    await seededLeague(page);
    await page.goto('/custom-gym-leader');
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
    await page.goto('/custom-gym-leader');
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
    await page.goto('/custom-gym-leader');
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

    const state = await midDrag(page, '[data-testid="card-cell-3-1"]', 0, 120);
    expect(state.held, 'a boundary paint holds nothing').toBe(0);
  });
});
