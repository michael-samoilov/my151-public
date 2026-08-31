import { expect, test, type Page } from '@playwright/test';
import { blankLeague } from './support/leagueSeed';

/**
 * The ace and the partner share the card's top-left slot, split by a diagonal.
 *
 * Where each one sits was measured, not derived: `slot-lab.html` opens the two
 * halves so they can be dragged on the real card, and `slotLayout.ts` holds
 * the reading that came back. So what this spec checks is that the running
 * card still lands on that reading — at every width, in the slot's own
 * proportions — because two things quietly move it. The card scales itself
 * with CSS `zoom`, so a placement measured on the screen box and applied in
 * the layout box comes out pulled toward the top-left corner by a quarter.
 * And the runs are text, so their size follows the font and the language.
 */

/** The sprite centres the lab was read at, as shares of the slot. */
const CENTRES = {
  'slot-ace': { x: 0.3001, y: 0.3241 },
  'slot-partner': { x: 0.6881, y: 0.6134 },
};

/**
 * How far a centre may drift from its reading.
 *
 * Wide enough for the pixel rounding in a slot measured at six different
 * widths, and nowhere near wide enough to pass the zoom bug this is here to
 * catch: that one put the ace at 23% of the slot instead of 30%.
 */
const DRIFT = 0.02;

const openCard = async (page: Page) => {
  await page.goto('/pokemon-league-builder');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.click('[data-testid="league-slot-0"]');
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(600);
};

/** Each half's sprite square, in shares of the slot, and what it paints. */
async function slotGeometry(page: Page) {
  return page.evaluate(() => {
    const seam = document.querySelector('svg line[vector-effect="non-scaling-stroke"]')!;
    const slot = seam.closest('div')!;
    const s = slot.getBoundingClientRect();
    const halves = ['slot-ace', 'slot-partner'].map((id) => {
      const half = slot.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
      // An empty half draws a ring at 62% of the square the geometry gives
      // it, so scale back to that square. Comparing a filled half's sprite
      // against a null is how this spec once "measured" a 50px difference
      // between two halves that were in fact the same size.
      const img = half.querySelector('img');
      const ring = half.querySelector<HTMLElement>('span > span.rounded-full');
      const r = (img ?? ring)!.getBoundingClientRect();
      const sprite = img ? r.width : r.width / 0.62;
      const box = {
        left: r.left + r.width / 2 - sprite / 2,
        top: r.top + r.height / 2 - sprite / 2,
      };
      // Every run the half paints, so nothing can leave the slot unnoticed.
      const runs = [...half.querySelectorAll<HTMLElement>('span, img')]
        .map((el) => el.getBoundingClientRect())
        .filter((v) => v.width > 1);
      return {
        id,
        sprite,
        cx: (box.left + sprite / 2 - s.left) / s.width,
        cy: (box.top + sprite / 2 - s.top) / s.height,
        box: { left: box.left, top: box.top, right: box.left + sprite, bottom: box.top + sprite },
        outOfSlot: Math.max(
          0,
          ...runs.flatMap((v) => [s.left - v.left, v.right - s.right, s.top - v.top, v.bottom - s.bottom]),
        ),
      };
    });
    const [ace, partner] = halves;
    return {
      halves,
      // The slot's own size, so a share can be read back as pixels.
      slot: { width: s.width, height: s.height },
      // A team cell, which is the sprite the pair is judged against.
      team: document.querySelector('[data-testid="card-cell-1-1"] img')?.getBoundingClientRect().width ?? null,
      // The two sprites are allowed to cross at the corner, where a sprite
      // carries its transparent margin. How much they cross is the number.
      overlap:
        Math.max(0, Math.min(ace.box.right, partner.box.right) - Math.max(ace.box.left, partner.box.left)) *
        Math.max(0, Math.min(ace.box.bottom, partner.box.bottom) - Math.max(ace.box.top, partner.box.top)),
    };
  });
}

test.describe('the ace and partner slot', () => {
  test('both halves sit where the lab put them, at any width', async ({ page }) => {
    await blankLeague(page);
    await openCard(page);
    const { halves, slot } = await slotGeometry(page);
    for (const half of halves) {
      const want = CENTRES[half.id as keyof typeof CENTRES];
      const where = `${half.id} in a slot ${slot.width.toFixed(0)}px wide`;
      expect(Math.abs(half.cx - want.x), `${where}, across`).toBeLessThanOrEqual(DRIFT);
      expect(Math.abs(half.cy - want.y), `${where}, down`).toBeLessThanOrEqual(DRIFT);
      expect(half.outOfSlot, `${half.id} paints outside the slot`).toBeLessThanOrEqual(1);
    }
  });

  test('the two sprites cross only at the corner', async ({ page }) => {
    await blankLeague(page);
    await openCard(page);
    const { halves, overlap } = await slotGeometry(page);
    // "It is fine if they cross a tiny bit" is the design, so the check is on
    // how much: a corner, not a bite out of either sprite.
    const area = halves[0].sprite ** 2;
    expect(overlap / area, 'the sprites overlap').toBeLessThanOrEqual(0.1);
  });

  test('neither sprite is smaller than a team cell', async ({ page }) => {
    await openCard(page);
    const { halves, team } = await slotGeometry(page);
    expect(team, 'the seeded card has a team cell to compare against').not.toBeNull();
    for (const half of halves) {
      // The complaint this replaced a fitting solver over: the two halves had
      // been sized to what could clear the seam, which put the card's most
      // important sprite below the size of one of its team members.
      expect(half.sprite, `${half.id} against a team cell`).toBeGreaterThanOrEqual(team! - 1);
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

  test('both halves get the same sprite', async ({ page }) => {
    await openCard(page);
    const { halves } = await slotGeometry(page);
    const ace = halves.find((h) => h.id === 'slot-ace')!;
    const partner = halves.find((h) => h.id === 'slot-partner')!;
    // Equal is the invariant. The partner's wedge is the smaller partition,
    // so sizing each half to its own room made the partner read as the lesser
    // one; the pair is one size and the slot's width sets it.
    expect(Math.abs(ace.sprite - partner.sprite), 'the two match').toBeLessThanOrEqual(1);
  });
});
