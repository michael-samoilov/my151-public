import { expect, test, type Page } from '@playwright/test';

/**
 * The gym card's two authored slots: the TM and the badge.
 *
 * Both had a wrong signal that only shows up in the rendered box — a TM disc
 * painted in the gym's colour rather than the move's, and a badge whose word
 * "Badge" sat under the name instead of finishing the phrase. So both are
 * checked against what the browser actually paints.
 */

const openCard = async (page: Page) => {
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

    await page.click('text=SIGNATURE POKÉMON');
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
    expect(state.rendered.length).toBeGreaterThan(8);
    expect(state.rendered.length).toBeLessThan(60);
    expect(state.rendered.startsWith('Thunder Cascade')).toBe(true);
    expect(state.stored).toBe(state.rendered);
  });
});
