import { expect, test, type Page } from '@playwright/test';
import { blankLeague, seededLeague } from './support/leagueSeed';

/**
 * The gym card's two authored slots: the TM and the badge.
 *
 * Both had a wrong signal that only shows up in the rendered box — a TM disc
 * painted in the gym's colour rather than the move's, and a badge whose word
 * "Badge" sat under the name instead of finishing the phrase. So both are
 * checked against what the browser actually paints.
 */

const openCard = async (page: Page) => {
  await blankLeague(page);
  await page.goto('/pokemon-league-builder');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.click('[data-testid="league-slot-0"]');
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  // The mobile pane track finishes translating before anything is measured.
  await page.waitForTimeout(500);
};

/** Seat a line by searching the selection pane for it. */
const seat = async (page: Page, cell: string, query: string) => {
  await page.click(cell);
  await page.waitForTimeout(600);
  await page.evaluate((q) => {
    const inputs = [...document.querySelectorAll('input')];
    const el = inputs[inputs.length - 1];
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setValue.call(el, q);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, query);
  await page.waitForTimeout(700);
  await page.click('[data-testid="verify-evo-card"]');
  await page.waitForTimeout(400);
};

/**
 * The longest single-word move stays inside its box, at every phone shape.
 *
 * A single word cannot wrap, so the box either holds it or cuts it — and this
 * box has been re-cut twice, once to fit the word and once to move the name
 * off the disc. What must never happen is the third thing: the word painting
 * over the cell beside it. So the invariant checked here is containment, not
 * fit.
 *
 * Fit is not containment, and the difference is measured. The card is laid
 * out at `room / squash` and then zoomed down, so a *short* viewport lays the
 * card out wider and gives the text more room; a tall one gives it least.
 * Flamethrower fits at 393x661 and is cut by 10px at 393x800. That is
 * today's behaviour on both sides of this change, and it is a defect of the
 * box's own width, not of where the name starts.
 */
const PHONES = [
  { width: 360, height: 661 },
  { width: 393, height: 800 },
  { width: 412, height: 915 },
];

test.describe('the longest move in the TM box', () => {
  for (const viewport of PHONES) {
    test(`stays inside it at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      });
      const page = await context.newPage();
      // Flamethrower, twelve letters, seated straight into the card.
      await page.addInitScript(() => {
        const cards = Array.from({ length: 14 }, () => ({
          type: null as string | null,
          theme: '',
          lines: [] as unknown[],
          signatureSeat: null as number | null,
          tmMoveId: null as number | null,
          badgeName: '',
          legend: null as unknown,
          powerup: null as unknown,
        }));
        cards[0].tmMoveId = 53;
        window.localStorage.setItem(
          'league-builder',
          JSON.stringify({ state: { name: '', cards }, version: 1 }),
        );
      });
      await page.goto('/pokemon-league-builder');
      await page.waitForSelector('[data-testid="league-slot-0"]');
      await page.click('[data-testid="league-slot-0"]');
      await page.waitForSelector('[data-testid="card-cell-1-1"]');
      await page.waitForTimeout(700);

      const fit = await page.evaluate(() => {
        const slot = document.querySelector('[data-testid="slot-tm"]')!;
        const name = [...slot.querySelectorAll('span')]
          .find((el) => el.textContent === 'Flamethrower');
        if (!name) return null;
        const box = slot.getBoundingClientRect();
        const run = name.getBoundingClientRect();
        return { spill: +(run.right - box.right).toFixed(2) };
      });
      expect(fit, 'the move is on the card').not.toBeNull();
      expect(fit!.spill, 'the name never reaches past its own box').toBeLessThanOrEqual(0.5);
      await context.close();
    });
  }
});

test.describe('gym card slots', () => {
  test('the signature pane reads the team as lines, in league order', async ({ page }) => {
    await openCard(page);
    // Seeded out of order on purpose. Magnezone is a generation 4 Pokémon
    // whose line starts at Magnemite in generation 1 — the line's own
    // earliest generation is what orders it, not the member that matched.
    await seat(page, '[data-testid="card-cell-1-1"]', 'lotad');      // gen 3, #270
    await seat(page, '[data-testid="card-cell-1-2"]', 'magnezone');  // line: gen 1, #81
    await seat(page, '[data-testid="card-cell-2-3"]', 'chinchou');   // gen 2, #170
    await seat(page, '[data-testid="card-cell-5-4"]', 'caterpie');   // gen 1, #10

    await page.click('[data-testid="slot-ace"]');
    await page.waitForSelector('[data-filter-chip="scope"]');
    await page.click('[data-filter-chip="scope"]');
    await page.waitForTimeout(700);

    const view = await page.evaluate(() => ({
      headings: [...document.querySelectorAll('.uppercase.tracking-wide')].map((h) => h.textContent?.trim()),
      members: [...document.querySelectorAll('[data-testid="verify-evo-card"] img[alt]')].map((i) => (i as HTMLImageElement).alt),
    }));

    // One group, not a generation heading in sight.
    expect(view.headings).toEqual(['Current Team']);
    expect(view.members).toEqual([
      'caterpie', 'metapod', 'butterfree',
      'magnemite', 'magneton', 'magnezone',
      'chinchou', 'lanturn',
      'lotad', 'lombre', 'ludicolo',
    ]);
  });

  test('the team scope draws the seated branch, not the whole chain', async ({ page }) => {
    await openCard(page);
    // Scyther's chain splits: Scizor and Kleavor. Only the seated branch
    // belongs in the pane, and Scyther belongs in it once.
    await seat(page, '[data-testid="card-cell-1-1"]', 'scizor');
    await seat(page, '[data-testid="card-cell-1-2"]', 'chinchou');

    await page.click('[data-testid="slot-ace"]');
    await page.waitForSelector('[data-filter-chip="scope"]');
    await page.click('[data-filter-chip="scope"]');
    await page.waitForTimeout(700);

    const view = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll('[data-testid="verify-evo-card"]')];
      const names = tiles.flatMap((t) => [...t.querySelectorAll('img[alt]')].map((i) => (i as HTMLImageElement).alt));
      const cell = document.querySelector('[data-row-cell]')!.getBoundingClientRect().width;
      // The backing rectangle: one per line when tiles are grouped, one per
      // Pokémon when they stand alone.
      const backs = [...document.querySelectorAll('div.absolute.rounded-md.border')]
        .map((e) => e.getBoundingClientRect().width);
      return {
        names,
        count: Number(document.querySelector('[data-result-count]')?.getAttribute('data-result-count')),
        cell,
        widestBack: Math.max(...backs),
      };
    });

    expect(view.names).toEqual(['scyther', 'scizor', 'chinchou', 'lanturn']);
    expect(view.names).not.toContain('kleavor');
    // The count beside the search box agrees with what is drawn.
    expect(view.count).toBe(4);
    // Every backing rectangle fits inside one cell: each Pokémon is its own
    // tile, not one rectangle stretched over a line.
    expect(view.widestBack).toBeLessThan(view.cell);
  });

  test('My dex on an empty dex filters to nothing, not to everything', async ({ page }) => {
    await openCard(page);
    await page.click('[data-testid="card-cell-1-1"]');
    await page.waitForSelector('[data-filter-chip="my-dex"]');
    const before = await page.evaluate(
      () => Number(document.querySelector('[data-result-count]')?.getAttribute('data-result-count')),
    );
    expect(before).toBeGreaterThan(100);

    await page.click('[data-filter-chip="my-dex"]');
    await page.waitForTimeout(600);
    const after = await page.evaluate(
      () => Number(document.querySelector('[data-result-count]')?.getAttribute('data-result-count')),
    );
    // Restricting to a set of none is not the same as not restricting. The
    // two used to share a memo key, so the chip handed back everything.
    expect(after).toBe(0);
  });

  test('the Current Team chip stays on until the card is emptied', async ({ page }) => {
    await openCard(page);
    const results = () =>
      page.evaluate(() => Number(document.querySelector('[data-result-count]')?.getAttribute('data-result-count')));
    const chipIsOff = () => page.locator('[data-filter-chip="scope"]').count();

    // Nothing seated: there is no team to narrow to, so no chip at all.
    await page.click('[data-testid="slot-ace"]');
    await page.waitForSelector('[data-result-count]');
    await page.waitForTimeout(500);
    expect(await chipIsOff(), 'no chip on an empty card').toBe(0);
    expect(await page.evaluate(() => /Current Team/.test(document.body.innerText))).toBe(false);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    await seat(page, '[data-testid="card-cell-1-1"]', 'chinchou');
    await seat(page, '[data-testid="card-cell-1-2"]', 'lotad');

    await page.click('[data-testid="slot-ace"]');
    await page.waitForSelector('[data-filter-chip="scope"]');
    await page.click('[data-filter-chip="scope"]');
    await page.waitForTimeout(600);
    const scoped = await results();
    expect(scoped).toBe(5);

    // Reopening keeps it on.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.click('[data-testid="slot-ace"]');
    await page.waitForTimeout(800);
    expect(await chipIsOff(), 'still on after reopening').toBe(0);
    expect(await results()).toBe(scoped);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Emptying the card clears it: the scope cannot outlive what it scopes to.
    for (let i = 0; i < 2; i++) {
      await page.locator('[aria-label^="Remove"]').first().click();
      await page.waitForTimeout(500);
    }
    await page.click('[data-testid="slot-ace"]');
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => /Current Team/.test(document.body.innerText))).toBe(false);
    expect(await results()).toBeGreaterThan(100);
  });

  test('the My dex chip stays on until it is turned off', async ({ page }) => {
    // Seeded before any app script runs: the chip filters to the dex builder's
    // own placed set, and an empty dex makes "filtered" and "unfiltered"
    // indistinguishable from a mistake.
    await page.addInitScript(() => {
      localStorage.setItem('personal-151-pokedex-v3', JSON.stringify({
        state: {
          sections: { starter: [1, 2, 3, 4, 5, 6], forest: [10, 11, 12] },
          customOrder: {}, sortOption: 'dex', groupSpecialAtEnd: false,
        },
        version: 3,
      }));
    });
    await openCard(page);
    const results = () =>
      page.evaluate(() => Number(document.querySelector('[data-result-count]')?.getAttribute('data-result-count')));

    await page.click('[data-testid="card-cell-1-1"]');
    await page.waitForSelector('[data-filter-chip="my-dex"]');
    const unfiltered = await results();
    await page.click('[data-filter-chip="my-dex"]');
    await page.waitForTimeout(500);
    const filtered = await results();
    expect(filtered).toBeLessThan(unfiltered);

    // Close the pane and open it for a different seat.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.click('[data-testid="card-cell-1-2"]');
    await page.waitForTimeout(800);
    expect(await page.locator('[data-filter-chip="my-dex"]').count(), 'the off-state chip is gone').toBe(0);
    expect(await results(), 'the filter is still applied').toBe(filtered);

    // Turning it off sticks too.
    await page.evaluate(() => {
      const chip = [...document.querySelectorAll('span')].find(
        (el) => /My dex/.test(el.textContent ?? '') && el.className.includes('bg-foreground'),
      );
      (chip?.querySelectorAll('button')[1] as HTMLButtonElement | undefined)?.click();
    });
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.click('[data-testid="card-cell-2-3"]');
    await page.waitForTimeout(800);
    expect(await page.locator('[data-filter-chip="my-dex"]').count(), 'it stayed off').toBe(1);
  });

  test('the TM disc takes the move\'s type, not the gym\'s', async ({ page }) => {
    await openCard(page);
    await page.click('text=Pick a move');
    await page.waitForSelector('[data-testid="tm-filter-category"]');
    await page.fill('input[placeholder="Search moves"]', 'flamethrower');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /Flamethrower/ }).first().click();
    await page.waitForTimeout(400);

    const stroke = await page.evaluate(() => {
      // The disc is the one skewed pokeball on the card.
      const disc = [...document.querySelectorAll('svg')].find((s) => s.querySelector('g[transform*="skew"]'));
      return disc?.querySelector('circle')?.getAttribute('stroke') ?? null;
    });
    // Fire, from the Gen IX badge palette. The card has no type set at all
    // here, so a disc wearing the gym colour would be the neutral grey.
    expect(stroke?.toUpperCase()).toBe('#E62829');
  });

  test('the badge name and the word Badge are one wrapping phrase', async ({ page }) => {
    await openCard(page);
    const field = page.locator('[aria-label="Badge name"]');
    await field.click();
    await page.keyboard.type('Thunder');
    await page.waitForTimeout(200);

    const short = await page.evaluate(() => {
      const el = document.querySelector('[aria-label="Badge name"]')!;
      const box = el.parentElement!;
      return { field: el.textContent, phrase: box.textContent };
    });
    expect(short.field).toBe('Thunder');
    expect(short.phrase).toBe('Thunder Badge');
  });

  test('the badge refuses text that would spill out of its slot', async ({ page }) => {
    await openCard(page);
    const field = page.locator('[aria-label="Badge name"]');
    await field.click();
    await page.keyboard.type('Thunder Cascade Marsh Rainbow Soul Volcano Earth Boulder Zephyr Glacier');
    await page.waitForTimeout(500);

    const state = await page.evaluate(() => {
      const el = document.querySelector('[aria-label="Badge name"]')!;
      const box = el.parentElement!;
      const slot = box.parentElement!;
      return {
        stored: (JSON.parse(localStorage.getItem('league-builder') ?? '{}').state?.cards?.[0]?.badgeName ?? '') as string,
        rendered: el.textContent ?? '',
        overflows: box.scrollHeight > box.clientHeight + 1,
        insideSlot: box.getBoundingClientRect().bottom <= slot.getBoundingClientRect().bottom + 1,
      };
    });
    // Typing kept going long past the limit; the slot stayed intact.
    expect(state.overflows).toBe(false);
    expect(state.insideSlot).toBe(true);
    // What survived is what fits, and it is the head of what was typed —
    // not a scrambled reorder, which is what a field that rewrites itself
    // mid-keystroke produces.
    // The box is a row and a half now, two lines beside the hexagon rather
    // than three under it, so what fits is shorter than it was. The property
    // is that what survived is the *head* of what was typed, whatever length
    // the box allows — a field that rewrites itself mid-keystroke produces a
    // scrambled reorder instead, which is what this catches.
    expect(state.rendered.length).toBeGreaterThan(4);
    expect(state.rendered.length).toBeLessThan(60);
    // The head of what was typed, in order. Not every character of it, and
    // not a fixed prefix: how much fits depends on the width the card is
    // drawn at, and once the box is full a narrow letter can still slip in
    // where a wide one was refused, so the last character may not be the one
    // that came next. Both are the field's own behaviour. What this test is
    // for is that everything before that point survives *in order*, which is
    // what a field rewriting itself mid-keystroke destroys.
    const typed = 'Thunder Cascade Marsh Rainbow Soul Volcano Earth Boulder Zephyr Glacier';
    const kept = state.rendered.replace(/\u00a0/g, ' ');
    let common = 0;
    while (common < kept.length && kept[common] === typed[common]) common++;
    // Everything but the tail is the head of what was typed, in order. The
    // tail can hold a character or two that never followed: once the box is
    // full the field tests each keystroke on its own, so a narrow letter fits
    // where a wide one was refused, and a trailing space arrives as a
    // non-breaking one. Order is the property; the last couple of characters
    // are the field's own arithmetic.
    expect(common, `"${kept}" is the head of what was typed`)
      .toBeGreaterThanOrEqual(kept.length - 2);
    expect(common, 'and enough of it to show the order held').toBeGreaterThan(4);
    expect(state.stored).toBe(state.rendered);
  });
});

/**
 * Filling a slot moves nothing inside it.
 *
 * An empty slot used to wear its dashed outline as a border, and a border is
 * layout: with `box-sizing: border-box` it takes its pixel from the inside,
 * so every slot's content sat a pixel further in while empty and stepped
 * back out the moment something was chosen. The outline is an overlay now.
 * This reads each pane's anchor in both states and expects the same offset,
 * to a twentieth of a pixel rather than the whole pixel that used to hide it.
 *
 * The heading colours ride along: the ace and partner words follow the TM
 * and BADGE words -- the gym's hint shade while empty, its band once filled.
 */
test.describe('an empty slot and a filled one', () => {
  /** Each pane's anchor, offset from the pane's own outer edge, in slot px. */
  const anchors = (page: Page) =>
    page.evaluate(() => {
      const hex = (c: string) => {
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
        return m ? '#' + [1, 2, 3].map((k) => Number(m[k]).toString(16).padStart(2, '0')).join('') : c;
      };
      const rel = (pane: Element, inner: Element) => {
        const p = pane.getBoundingClientRect();
        const i = inner.getBoundingClientRect();
        const zoom = p.width / (pane as HTMLElement).offsetWidth;
        return [(i.left - p.left) / zoom, (i.top - p.top) / zoom].map((v) => Number(v.toFixed(2)));
      };
      const tm = document.querySelector('[data-testid="slot-tm"]')!;
      const badge = document.querySelector('[data-testid="slot-badge"]')!;
      const ace = document.querySelector('[data-testid="slot-ace"]')!;
      const partner = document.querySelector('[data-testid="slot-partner"]')!;
      const pane = ace.parentElement!;
      const word = (root: Element, text: string) =>
        [...root.querySelectorAll('span')].find((el) => el.childElementCount === 0 && el.textContent === text)!;
      return {
        tm: rel(tm, tm.querySelector('svg')!),
        badge: rel(badge, badge.querySelector('svg')!),
        ace: rel(pane, ace.querySelector('[data-slot-art]')!),
        partner: rel(pane, partner.querySelector('[data-slot-art]')!),
        colours: {
          aceHead: hex(getComputedStyle(word(ace, 'ACE')).color),
          partnerHead: hex(getComputedStyle(word(partner, 'PARTNER /')).color),
          tmWord: hex(getComputedStyle(word(tm, 'TM')).color),
          badgeWord: hex(getComputedStyle(word(badge, 'BADGE')).color),
        },
      };
    });

  test('put their content in the same place', async ({ page }) => {
    await openCard(page);
    const empty = await anchors(page);

    // The seeded card 0: an ace, a TM and a badge, and no partner.
    await seededLeague(page);
    await page.goto('/pokemon-league-builder');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(500);
    const filled = await anchors(page);

    for (const key of ['tm', 'badge', 'ace', 'partner'] as const) {
      expect(Math.abs(filled[key][0] - empty[key][0]), `${key} x`).toBeLessThanOrEqual(0.05);
      expect(Math.abs(filled[key][1] - empty[key][1]), `${key} y`).toBeLessThanOrEqual(0.05);
    }

    // Empty, every heading is the hint; the ace and TM read the same shade.
    expect(empty.colours.aceHead).toBe(empty.colours.tmWord);
    expect(empty.colours.partnerHead).toBe(empty.colours.tmWord);
    // Filled, the ace darkens to the band the BADGE word wears. The partner
    // half is still empty on this card, so it stays on the hint.
    expect(filled.colours.aceHead).toBe(filled.colours.badgeWord);
    expect(filled.colours.aceHead).not.toBe(empty.colours.aceHead);
    expect(filled.colours.partnerHead).not.toBe(filled.colours.aceHead);
  });
});
