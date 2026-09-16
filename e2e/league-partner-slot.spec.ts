import { expect, test, type Page } from '@playwright/test';
import { blankLeague, pairLeague } from './support/leagueSeed';

/**
 * The ace and the partner share the card's top-left slot, split by a diagonal.
 *
 * CSS pins ace top-left and partner bottom-right, same padding, partner
 * column reversed. Sprite size is 1× or 2× of the 96px source, never a
 * pane fraction. This spec checks that layout, not a solver reading.
 */

const openCard = async (page: Page) => {
  await page.goto('/custom-gym-leader');
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
      // The square the geometry reserves, which both states draw inside — the
      // ball and the sprite when filled, the placeholder when not. Comparing
      // a filled half's sprite against a null is how this spec once
      // "measured" a 50px difference between two halves that were in fact the
      // same size.
      const r = half.querySelector<HTMLElement>('[data-slot-art]')!.getBoundingClientRect();
      const sprite = r.width;
      const box = {
        left: r.left + r.width / 2 - sprite / 2,
        top: r.top + r.height / 2 - sprite / 2,
      };
      // Every run the half paints, so nothing can leave the slot unnoticed.
      const runs = [...half.querySelectorAll<HTMLElement>('span, img')]
        .map((el) => el.getBoundingClientRect())
        .filter((v) => v.width > 1);
      // The empty state's placeholder ball, and how far past the seam it
      // reaches. Negative is clear of it.
      const disc = half.querySelector<HTMLElement>('[data-slot-ring]')?.getBoundingClientRect();
      // Both ends off the drawn line, because the seam is no longer a
      // corner-to-corner diagonal: it runs at the placeholder ball's own 30
      // degrees, through the middle of the slot.
      const at = (n: string, size: number) => (Number(seam.getAttribute(n)) / 100) * size;
      const [ax, ay, bx, by] = [at('x1', s.width), at('y1', s.height), at('x2', s.width), at('y2', s.height)];
      const len = Math.hypot(bx - ax, by - ay);
      const past = disc
        ? disc.width / 2 - Math.abs(
            (bx - ax) * (disc.top + disc.height / 2 - s.top - ay)
            - (by - ay) * (disc.left + disc.width / 2 - s.left - ax),
          ) / len
        : null;
      return {
        id,
        sprite,
        ring: disc ? disc.width : null,
        ringPastSeam: past,
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
  test('the two halves are a mirrored pair, at any width', async ({ page }) => {
    await blankLeague(page);
    await openCard(page);
    const { halves, slot } = await slotGeometry(page);
    const ace = halves.find((h) => h.id === 'slot-ace')!;
    const partner = halves.find((h) => h.id === 'slot-partner')!;
    const where = `in a slot ${slot.width.toFixed(0)}px wide`;
    expect(ace.cx, `ace stays left, ${where}`).toBeLessThan(0.5);
    expect(ace.cy, `ace stays top, ${where}`).toBeLessThan(0.5);
    expect(partner.cx, `partner stays on the right, ${where}`).toBeGreaterThan(0.5);
    expect(partner.cy, `partner stays on the bottom, ${where}`).toBeGreaterThan(0.5);
    for (const half of halves) {
      expect(half.outOfSlot, `${half.id} paints outside the slot`).toBeLessThanOrEqual(1);
    }
  });

  test('the two sprites cross only at the corner', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'narrow',
      '1× at dpr 1 is 96 CSS px; two squares do not fit a 320 pane',
    );
    await blankLeague(page);
    await openCard(page);
    const { halves, overlap } = await slotGeometry(page);
    // "It is fine if they cross a tiny bit" is the design, so the check is on
    // how much: a corner, not a bite out of either sprite.
    const area = halves[0].sprite ** 2;
    expect(overlap / area, 'the sprites overlap').toBeLessThanOrEqual(0.02);
  });

  test('the placeholder rings stop short of the seam', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'narrow',
      '1× at dpr 1 is 96 CSS px; two squares do not fit a 320 pane',
    );
    await blankLeague(page);
    await openCard(page);
    const { halves } = await slotGeometry(page);
    for (const half of halves) {
      // A sprite may cross the seam at its corner, which is its own
      // transparent margin. A drawn circle is ink the whole way round, so it
      // has no corner to spend and stops short instead.
      expect(half.ring, `${half.id} draws a placeholder when empty`).not.toBeNull();
      expect(half.ringPastSeam!, `${half.id} placeholder reaches past the seam`).toBeLessThan(0);
    }
  });

  test('the sprite is an integer device-pixel scale', async ({ page }) => {
    await blankLeague(page);
    await openCard(page);
    const { halves, slot } = await slotGeometry(page);
    const measured = await page.evaluate(() => {
      const pane = document.querySelector<HTMLElement>('[data-ace-partner-slot]')!;
      const art = pane.querySelector<HTMLElement>('[data-slot-art]')!;
      return {
        layout: art.offsetWidth,
        attr: Number(pane.dataset.slotSprite),
        dpr: window.devicePixelRatio,
        style: getComputedStyle(art).width,
      };
    });
    const one = Math.round(96 / measured.dpr);
    const two = Math.round(192 / measured.dpr);
    expect([one, two], `layout ${measured.layout} at dpr ${measured.dpr}`).toContain(measured.layout);
    expect(measured.attr).toBe(measured.layout);
    expect(measured.style).not.toContain('cqw');
    for (const half of halves) {
      expect(half.sprite, `${half.id} painted`).toBeGreaterThan(8);
    }
    expect(slot.width).toBeGreaterThan(8);
  });

  test('Hisuian Braviary and Celesteela do not overlap', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'narrow',
      '1× at dpr 1 is 96 CSS px; two squares do not fit a 320 pane',
    );
    await pairLeague(page, 10240, 797);
    await openCard(page);
    const { halves, overlap } = await slotGeometry(page);
    const area = halves[0].sprite ** 2;
    expect(halves[0].sprite, 'ace sprite is on the card').toBeGreaterThan(8);
    expect(overlap / area, 'large sprites overlap').toBeLessThanOrEqual(0.02);
  });

  test('the empty state puts its heading where the filled one does', async ({ page }) => {
    await blankLeague(page);
    await openCard(page);

    /**
     * Each half's heading and name, offset from the half's own top-left, in
     * the slot's own pixels.
     *
     * Divided by the card's zoom, because the card re-fits itself to its
     * content and its content changes here: an empty card's hints are not a
     * filled card's, and at 320px one of them wraps. Read on the screen,
     * every run would move by the change of scale and the check would be
     * about the fit; read in layout pixels it is about the slot.
     */
    const runs = () =>
      page.evaluate(() =>
        ['slot-ace', 'slot-partner'].map((id) => {
          const half = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
          const box = half.getBoundingClientRect();
          const zoom = box.width / half.offsetWidth;
          return [...half.querySelectorAll('span')]
            .filter((el) => (el.textContent ?? '').trim().length > 0 || el.innerHTML === '&nbsp;')
            .map((el) => Number(((el.getBoundingClientRect().top - box.top) / zoom).toFixed(2)));
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
    // A twentieth of a pixel, not a whole one: the runs are measured against
    // the half's own box, and nothing inside it should move at all. This does
    // not see the pane's own outline -- the half moves with it -- so a border
    // that shifts the whole pane is the card-slots spec's job, not this one's.
    filled[1].forEach((top, i) => {
      expect(Math.abs(top - empty[1][i]), `partner text run ${i} moved`).toBeLessThanOrEqual(0.1);
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
