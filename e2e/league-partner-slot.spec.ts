import { expect, test, type Page } from '@playwright/test';
import { blankLeague, pairLeague } from './support/leagueSeed';

/**
 * The ace and the partner share the card's top-left slot, split by a diagonal.
 *
 * CSS pins ace top-left at 2× the team sprite and partner bottom-right at
 * 1×. Sizes are whole multiples of the team sprite, never a pane fraction.
 * The captions' fit and the seam are read from the drawn text
 * (`showcaseLayout.ts`), so this spec measures the drawn text too.
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
  test('the two halves are a mirrored pair, at any width', { tag: '@viewport' }, async ({ page }) => {
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

  test('the two sprites cross only at the corner', { tag: '@viewport' }, async ({ page }, testInfo) => {
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

  test('the placeholder rings stop short of the seam', { tag: '@viewport' }, async ({ page }, testInfo) => {
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

  test('the sprite is an integer device-pixel scale', { tag: '@viewport' }, async ({ page }) => {
    await blankLeague(page);
    await openCard(page);
    const { halves, slot } = await slotGeometry(page);
    const measured = await page.evaluate(() => {
      const pane = document.querySelector<HTMLElement>('[data-ace-partner-slot]')!;
      const art = pane.querySelector<HTMLElement>('[data-slot-art]')!;
      const team = document.querySelector<HTMLElement>('[data-testid="card-cell-1-1"] img');
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const css = art.offsetWidth;
      const n = css / (3.25 * rem);
      const teamW = team?.offsetWidth ?? 0;
      return {
        layout: css,
        attr: Number(pane.dataset.slotSprite),
        rem,
        n,
        teamW,
        vsTeam: teamW > 0 ? css / teamW : 0,
        integer: [1, 2, 3].some((s) => Math.abs(n - s) < 0.02),
        style: getComputedStyle(art).width,
      };
    });
    expect(measured.integer, `n=${measured.n} css=${measured.layout} rem=${measured.rem}`).toBe(true);
    expect(measured.attr).toBeCloseTo(measured.layout, 0);
    expect(measured.style).not.toContain('cqw');
    if (measured.teamW > 0) {
      expect(
        [1, 2, 3].some((s) => Math.abs(measured.vsTeam - s) < 0.05),
        `ace ${measured.layout} vs team ${measured.teamW}`,
      ).toBe(true);
    }
    for (const half of halves) {
      expect(half.sprite, `${half.id} painted`).toBeGreaterThan(8);
    }
    expect(slot.width).toBeGreaterThan(8);
  });

  test('Hisuian Braviary and Celesteela do not overlap', { tag: '@viewport' }, async ({ page }, testInfo) => {
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

  test('the empty state puts its heading where the filled one does', { tag: '@viewport' }, async ({ page }) => {
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

    const pick = async (slot: string, query: string, throughOverlay = false) => {
      await page.click(
        `[data-testid="${slot}"]`,
        throughOverlay ? { position: { x: 8, y: 8 }, force: true } : {},
      );
      await page.waitForSelector('[data-filter-chip="my-dex"]');
      await page.evaluate((q) => {
        const inputs = [...document.querySelectorAll('input')];
        const el = inputs[inputs.length - 1];
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
        set.call(el, q);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, query);
      await page.waitForTimeout(700);
      await page.click('[data-testid="verify-evo-card"]');
      await page.waitForTimeout(700);
    };

    const empty = await runs();
    // One Pokémon centres itself. Fill both so this check stays on the
    // corner pair, which is the layout empty and filled must share.
    await pick('slot-partner', 'pikachu');
    await pick('slot-ace', 'bulbasaur', true);
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

  test('the ace is twice the partner', { tag: '@viewport' }, async ({ page }) => {
    await blankLeague(page);
    await openCard(page);
    const { halves } = await slotGeometry(page);
    const ace = halves.find((h) => h.id === 'slot-ace')!;
    const partner = halves.find((h) => h.id === 'slot-partner')!;
    // Michael's rule: the ace draws at twice the partner's scale, and the
    // partner stays one team sprite.
    expect(Math.abs(ace.sprite - 2 * partner.sprite), 'the ace is 2x').toBeLessThanOrEqual(1);
  });

  test('the widest names keep off the seam, the sprites and each other', { tag: '@viewport' }, async ({ page }, testInfo) => {
    // German Gumshoos and Oranguru, MANGUSPEKTOR and KOMMANDUTAN, are the
    // widest ace and partner names the app ships in any locale, measured in
    // the caption face.
    await pairLeague(page, 735, 765);
    await page.goto('/custom-gym-leader?lang=de');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await expect(page.locator('[data-slot-name="partner"]')).toHaveText('Kommandutan');
    await page.evaluate(() => document.fonts.ready);
    // The fit settles over a few frames once the names land.
    await page.waitForTimeout(800);

    const got = await page.evaluate(() => {
      const pane = document.querySelector<HTMLElement>('[data-ace-partner-slot]')!;
      const p = pane.getBoundingClientRect();
      const zoom = p.width / pane.offsetWidth;
      const W = pane.offsetWidth;
      const H = pane.offsetHeight;
      type Box = { x: number; y: number; w: number; h: number };
      const rel = (r: DOMRect): Box => ({
        x: (r.left - p.left) / zoom, y: (r.top - p.top) / zoom, w: r.width / zoom, h: r.height / zoom,
      });
      const line = pane.querySelector('svg line')!;
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2']
        .map((k, i) => (Number(line.getAttribute(k)) / 100) * (i % 2 ? H : W));
      const seamY = (x: number) => y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
      // Each line of text as drawn, clipped where its element clips it.
      const lines = (el: Element): Box[] => {
        const cs = getComputedStyle(el);
        const clip = cs.overflowX === 'hidden' ? el.getBoundingClientRect() : null;
        const out: Box[] = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!(n.textContent ?? '').trim()) continue;
          range.selectNodeContents(n);
          for (const r of range.getClientRects()) {
            const left = clip ? Math.max(r.left, clip.left) : r.left;
            const right = clip ? Math.min(r.right, clip.right) : r.right;
            if (right - left > 0.5) out.push(rel(new DOMRect(left, r.top, right - left, r.height)));
          }
        }
        return out;
      };
      const half = (h: string) => {
        const root = pane.querySelector(`[data-slot-half="${h}"]`)!;
        const name = root.querySelector<HTMLElement>('[data-slot-name]')!;
        return {
          art: rel(root.querySelector('[data-slot-art]')!.getBoundingClientRect()),
          runs: [...lines(root.querySelector('[data-slot-head]')!), ...lines(name)],
          namePx: parseFloat(getComputedStyle(name).fontSize),
          // The text's drawn width against its box: an ellipsis can cut two
          // letters for an overflow under the pixel that scrollWidth rounds.
          clipped: (() => {
            const range = document.createRange();
            range.selectNodeContents(name);
            return range.getBoundingClientRect().width > name.getBoundingClientRect().width + 0.25;
          })(),
        };
      };
      const ace = half('ace');
      const partner = half('partner');
      const hit = (a: Box, b: Box) =>
        a.x < b.x + b.w - 0.25 && a.x + a.w > b.x + 0.25 && a.y < b.y + b.h - 0.25 && a.y + a.h > b.y + 0.25;
      const faults: string[] = [];
      for (const [side, mine, other] of [['ace', ace, partner], ['partner', partner, ace]] as const) {
        for (const r of mine.runs) {
          const at = `${side} line at ${r.x.toFixed(1)},${r.y.toFixed(1)}`;
          if (r.x < -0.5 || r.y < -0.5 || r.x + r.w > W + 0.5 || r.y + r.h > H + 0.5) faults.push(`${at} leaves the pane`);
          if (hit(r, ace.art) || hit(r, partner.art)) faults.push(`${at} is on a sprite`);
          if (other.runs.some((o) => hit(r, o))) faults.push(`${at} is on the other caption`);
          const gap = Math.min(...[r.x, r.x + r.w].flatMap((x) => [r.y, r.y + r.h].map((y) => (
            side === 'ace' ? seamY(x) - y : y - seamY(x)))));
          if (gap < 0) faults.push(`${at} crosses the seam by ${(-gap).toFixed(1)}px`);
        }
      }
      return {
        pane: { W, H, zoom }, seam: [x1, y1, x2, y2], faults,
        rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
        ace: { namePx: ace.namePx, clipped: ace.clipped },
        partner: { namePx: partner.namePx, clipped: partner.clipped },
      };
    });
    await testInfo.attach('widest-names.json', { body: JSON.stringify(got, null, 2), contentType: 'application/json' });
    expect(got.faults, 'every caption line clears the pane edge, the sprites, the seam and the other caption').toEqual([]);
    // A long name shrinks, but never under the 0.4rem floor the TM and badge
    // labels hold.
    expect(got.ace.namePx).toBeGreaterThanOrEqual(0.4 * got.rem - 0.01);
    expect(got.partner.namePx).toBeGreaterThanOrEqual(0.4 * got.rem - 0.01);
    expect(got.ace.clipped, 'the ace name is whole').toBe(false);
    // The last resort is an ellipsis, and only the narrowest pane, a 320px
    // phone that lays the card out at full height, needs it: there the
    // partner has 3.2rem beside it and KOMMANDUTAN is 3.5rem at the floor.
    if (testInfo.project.name !== 'narrow') {
      expect(got.partner.clipped, 'the partner name is whole').toBe(false);
    }
  });

  test('a lone ace keeps the empty partner half and the diagonal', { tag: '@viewport' }, async ({ page }) => {
    await pairLeague(page, 334, null);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(600);

    const got = await page.evaluate(() => {
      const pane = document.querySelector<HTMLElement>('[data-ace-partner-slot]')!;
      const art = pane.querySelector<HTMLElement>('[data-slot-art]')!;
      const slot = pane.getBoundingClientRect();
      const box = art.getBoundingClientRect();
      const zoom = slot.width / pane.offsetWidth;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const css = art.offsetWidth;
      const n = css / (3.25 * rem);
      return {
        mode: pane.dataset.showcase,
        seam: !!pane.querySelector('svg line[vector-effect="non-scaling-stroke"]'),
        arts: pane.querySelectorAll('[data-slot-art] img').length,
        heads: [...pane.querySelectorAll('[data-slot-head]')].map((el) => el.getAttribute('data-slot-head')),
        // The sprite square's offset from the pane's top-left corner, in
        // the pane's own px.
        inset: Math.max(box.left - slot.left, box.top - slot.top) / zoom,
        rem,
        css,
        attr: Number(pane.dataset.slotSprite),
        integer: [1, 2, 3].some((s) => Math.abs(n - s) < 0.02),
        partner: !!pane.querySelector('[data-testid="slot-partner"]'),
      };
    });
    expect(got.mode, 'one filled seat is still a split pane').toBe('split');
    expect(got.seam, 'the diagonal stays').toBe(true);
    expect(got.arts, 'one sprite').toBe(1);
    expect(got.heads, 'both headings').toEqual(['ace', 'partner']);
    expect(got.partner, 'empty partner half stays').toBe(true);
    // A lone ace does not centre itself: its square stays on the pane's pad.
    expect(got.inset, 'ace stays in its corner').toBeLessThanOrEqual(0.25 * got.rem + 1);
    expect(got.css).toBeCloseTo(got.attr, 0);
    expect(got.integer, `css ${got.css} is n×3.25rem`).toBe(true);

    await page.locator('[data-testid="slot-partner"]').click({ position: { x: 8, y: 8 }, force: true });
    await expect(page.locator('[data-filter-chip="my-dex"]')).toBeVisible();
  });

  test('a lone ace shows the full name inside the pane', async ({ page }) => {
    // Squat phone is where the sprite-width cap cuts ALAKAZAM. CSS truncate
    // keeps the full string in the DOM, so this check reads paint: no
    // ellipsis, and the last letter's box inside the pane.
    await page.setViewportSize({ width: 390, height: 667 });
    await pairLeague(page, 65, null);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="slot-ace"]');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);

    const got = await page.evaluate(() => {
      const pane = document.querySelector<HTMLElement>('[data-ace-partner-slot]')!;
      const cluster = pane.querySelector<HTMLElement>('[data-testid="slot-ace"]')!;
      const name = [...cluster.querySelectorAll('span')].find(
        (el) => /alakaz/i.test(el.textContent ?? '') && el.childElementCount === 0,
      );
      if (!name) {
        return {
          text: '',
          ellipsis: true,
          lastInsidePane: false,
          partner: false,
          seam: false,
          mode: null as string | null,
        };
      }
      const raw = (name.textContent ?? '').replace(/\s+/g, '');
      const cs = getComputedStyle(name);
      const node = [...name.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
      let lastInsidePane = false;
      if (node && raw.length > 0) {
        const range = document.createRange();
        range.setStart(node, raw.length - 1);
        range.setEnd(node, raw.length);
        const last = range.getBoundingClientRect();
        const pr = pane.getBoundingClientRect();
        lastInsidePane = last.width > 0.5
          && last.left >= pr.left - 0.5
          && last.right <= pr.right + 0.5
          && last.top >= pr.top - 0.5
          && last.bottom <= pr.bottom + 0.5;
      }
      return {
        text: raw,
        ellipsis: cs.textOverflow === 'ellipsis',
        lastInsidePane,
        partner: !!pane.querySelector('[data-testid="slot-partner"]'),
        seam: !!pane.querySelector('svg line[vector-effect="non-scaling-stroke"]'),
        mode: pane.dataset.showcase ?? null,
      };
    });
    expect(got.text.toUpperCase(), 'the DOM still holds ALAKAZAM').toBe('ALAKAZAM');
    expect(got.ellipsis, 'the name must not clip with an ellipsis').toBe(false);
    expect(got.lastInsidePane, 'the last letter stays inside the pane').toBe(true);
    expect(got.mode, 'one filled seat is still a split pane').toBe('split');
    expect(got.partner, 'empty partner half stays').toBe(true);
    expect(got.seam, 'the diagonal stays').toBe(true);
  });

  test('a lone partner keeps the empty ace half and the diagonal', { tag: '@viewport' }, async ({ page }) => {
    await pairLeague(page, null, 179);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="slot-tm"]');
    await page.waitForTimeout(600);

    const got = await page.evaluate(() => {
      const pane = document.querySelector<HTMLElement>('[data-ace-partner-slot]')!;
      const art = pane.querySelector<HTMLElement>('[data-testid="slot-partner"] [data-slot-art]')!;
      const box = art.getBoundingClientRect();
      const slot = pane.getBoundingClientRect();
      const zoom = slot.width / pane.offsetWidth;
      return {
        mode: pane.dataset.showcase,
        seam: !!pane.querySelector('svg line[vector-effect="non-scaling-stroke"]'),
        arts: pane.querySelectorAll('[data-slot-art] img').length,
        heads: [...pane.querySelectorAll('[data-slot-head]')].map((el) => el.getAttribute('data-slot-head')),
        // The sprite square's offset from the pane's bottom-right corner, in
        // the pane's own px.
        inset: Math.max(slot.right - box.right, slot.bottom - box.bottom) / zoom,
        rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
        ace: !!pane.querySelector('[data-testid="slot-ace"]'),
      };
    });
    expect(got.mode).toBe('split');
    expect(got.seam).toBe(true);
    expect(got.arts).toBe(1);
    expect(got.heads).toEqual(['ace', 'partner']);
    expect(got.ace).toBe(true);
    expect(got.inset, 'partner stays in its corner').toBeLessThanOrEqual(0.25 * got.rem + 1);
  });
});
