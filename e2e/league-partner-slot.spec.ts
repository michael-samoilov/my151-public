import { expect, test, type Page } from '@playwright/test';
import { blankLeague } from './support/leagueSeed';

/**
 * The ace and the partner share the card's top-left slot, split by a diagonal.
 *
 * Three things that split has to keep true, and none of them is visible in the
 * markup — they are all geometry, so this spec measures the running card:
 * neither half's content crosses the seam by more than the 4px the design
 * allows, the empty state holds the filled state's layout so the heading does
 * not slide up against the placeholder ring, and both sprites stay at least a
 * team cell's size at every width the card is drawn at.
 */

const SEAT_FLOOR = 52; // SPRITE_REM: the sprite a Pokémon gets in a team cell
const ALLOWANCE = 5; // the design's 4px, plus a pixel of rounding

const openCard = async (page: Page) => {
  await page.goto('/pokemon-league-builder');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.click('[data-testid="league-slot-0"]');
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(600);
};

/** How far each half reaches past the seam, and out of the slot. */
async function slotGeometry(page: Page) {
  return page.evaluate(() => {
    const seam = document.querySelector('svg line[vector-effect="non-scaling-stroke"]')!;
    const slot = seam.closest('div')!;
    const s = slot.getBoundingClientRect();
    // The seam's own endpoints, in the slot's coordinates. Reading them off
    // the element rather than restating them keeps the check honest if the
    // seam moves.
    const y1 = (Number(seam.getAttribute('y1')) / 100) * s.height;
    const y2 = (Number(seam.getAttribute('y2')) / 100) * s.height;
    const x1 = s.width;
    const x2 = 0;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const side = (px: number, py: number) =>
      ((x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)) / len;
    return ['slot-ace', 'slot-partner'].map((id) => {
      const half = slot.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
      // The union of the button and everything it paints: a heading set wider
      // than its button paints outside the button's own rect, which is exactly
      // the overflow worth catching.
      const boxes = [half, ...half.querySelectorAll('*')].map((el) => el.getBoundingClientRect());
      const r = {
        left: Math.min(...boxes.map((v) => v.left)),
        right: Math.max(...boxes.map((v) => v.right)),
        top: Math.min(...boxes.map((v) => v.top)),
        bottom: Math.max(...boxes.map((v) => v.bottom)),
      };
      const corners: [number, number][] = [
        [r.left - s.left, r.top - s.top], [r.right - s.left, r.top - s.top],
        [r.left - s.left, r.bottom - s.top], [r.right - s.left, r.bottom - s.top],
      ];
      const d = corners.map(([px, py]) => side(px, py));
      const img = half.querySelector('img');
      return {
        id,
        sprite: img ? img.getBoundingClientRect().width : null,
        pastSeam: Math.max(0, Math.min(Math.max(...d), -Math.min(...d))),
        outOfSlot: Math.max(
          0, s.left - r.left, r.right - s.right, s.top - r.top, r.bottom - s.bottom,
        ),
      };
    });
  });
}

test.describe('the ace and partner slot', () => {
  test('neither half crosses the seam, at any width the card is drawn at', async ({ page }) => {
    await blankLeague(page);
    await openCard(page);
    for (const half of await slotGeometry(page)) {
      expect(half.pastSeam, `${half.id} reaches past the seam`).toBeLessThanOrEqual(ALLOWANCE);
      expect(half.outOfSlot, `${half.id} paints outside the slot`).toBeLessThanOrEqual(1);
    }
  });

  test('the empty state puts its heading where the filled one does', async ({ page }) => {
    await blankLeague(page);
    await openCard(page);

    /** Each half's heading and name, offset from the half's own top-left. */
    const runs = () =>
      page.evaluate(() =>
        ['slot-ace', 'slot-partner'].map((id) => {
          const half = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
          const box = half.getBoundingClientRect();
          return [...half.querySelectorAll('span')]
            .filter((el) => (el.textContent ?? '').trim().length > 0 || el.innerHTML === '&nbsp;')
            .map((el) => Number((el.getBoundingClientRect().top - box.top).toFixed(2)));
        }),
      );

    const empty = await runs();
    await page.click('[data-testid="slot-partner"]');
    await page.waitForSelector('[data-filter-chip="my-dex"]');
    await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input')];
      const el = inputs[inputs.length - 1];
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      set.call(el, 'pikachu');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(700);
    await page.click('[data-testid="verify-evo-card"]');
    await page.waitForTimeout(700);
    const filled = await runs();

    // The partner half is the one that changed state; its runs must not move.
    filled[1].forEach((top, i) => {
      expect(Math.abs(top - empty[1][i]), `partner text run ${i} moved`).toBeLessThanOrEqual(1);
    });
  });

  test('a partner is not held to the team, and seats itself when there is room', async ({ page }) => {
    await blankLeague(page);
    await openCard(page);
    await page.click('[data-testid="slot-partner"]');
    await page.waitForSelector('[data-filter-chip="my-dex"]');
    // The ace picker locks to the card's own lines once the card is full; the
    // partner picker never does, so nothing here should be restricted.
    expect(await page.locator('[data-filter-chip="scope-locked"]').count()).toBe(0);
    await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input')];
      const el = inputs[inputs.length - 1];
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      set.call(el, 'pikachu');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(700);
    await page.click('[data-testid="verify-evo-card"]');
    await page.waitForTimeout(700);

    const state = await page.evaluate(() => {
      const raw = localStorage.getItem('league-builder');
      const card = raw ? JSON.parse(raw).state?.cards?.[0] : null;
      return { partnerId: card?.partnerId ?? null, lines: card?.lines?.length ?? 0 };
    });
    expect(state.partnerId, 'the card remembers its partner').not.toBeNull();
    // An empty card has room, so the same pick also fills a line.
    expect(state.lines, 'the partner seats itself when there is room').toBeGreaterThan(0);
  });

  test('both sprites stay at least a team cell wide', async ({ page }) => {
    await openCard(page);
    const halves = await slotGeometry(page);
    const ace = halves.find((h) => h.id === 'slot-ace')!;
    expect(ace.sprite, 'the ace has a sprite on the seeded card').not.toBeNull();
    // The card is zoomed to fit the viewport's height, so the floor is the
    // cell size the same zoom would give an ordinary seat.
    const cell = await page.evaluate(() => {
      const img = document.querySelector('[data-testid="card-cell-1-1"] img');
      return img ? img.getBoundingClientRect().width : null;
    });
    if (cell !== null) {
      expect(ace.sprite!, 'the ace is at least a cell sprite').toBeGreaterThanOrEqual(cell - 1);
    }
    expect(SEAT_FLOOR).toBe(52);
  });
});
