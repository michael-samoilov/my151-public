import { expect, test, type Page } from '@playwright/test';
import { blankLeague } from './support/leagueSeed';

/**
 * The one-Pokémon pickers: what their heading says, and how their grid packs.
 *
 * The ace and the partner are slots of their own on every card, so their
 * pickers name the slot, not the card: "Adding to: Ace Pokémon", not
 * "Adding to: Elite Four 2".
 *
 * Their tiles stand alone, so Eevee's eight branches merge into one
 * nine-tile chain, wider than the six-column grid. The grid packs whole
 * lines into rows and pads a row out when the next line will not fit, and a
 * line wider than a row broke that: it ran three cells into the next row,
 * every row after it started three cells early, and the padding meant for a
 * row's end landed mid-row as a one-cell gap -- Omastar, a gap, Kabuto. The
 * check is structural: in every rendered row, no empty cell sits before a
 * tile, and Omastar's neighbour is Kabuto.
 */

const openCard = async (page: Page, slot: number) => {
  await blankLeague(page);
  await page.goto('/custom-gym-leader');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.click(`[data-testid="league-slot-${slot}"]`);
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(400);
};

const openPicker = async (page: Page, slot: 'slot-ace' | 'slot-partner') => {
  await page.click(`[data-testid="${slot}"]`);
  await page.waitForSelector('[data-filter-chip="my-dex"]');
  await page.waitForTimeout(600);
};

/** The heading over the picker: the sheet's title on a phone, the pane's on desktop. */
const heading = (page: Page, desktop: boolean) =>
  desktop
    ? page.locator('h2', { hasText: 'Adding to:' }).first().innerText()
    : page.locator('[data-filter-chip="my-dex"]').evaluate((chip) => {
        // The sheet's title sits above the browser: the nearest heading text
        // before the chips that reads "Adding to".
        const sheet = chip.closest('[role="dialog"]') ?? document.body;
        const spans = [...sheet.querySelectorAll('span')];
        const lead = spans.find((s) => s.textContent?.trim() === 'Adding to:');
        return lead?.parentElement?.textContent?.replace(/\s+/g, ' ').trim() ?? '(no heading)';
      });

/** The nearest ancestor whose scrollTop moves an element. */
const scrollerOf = (el: Element): HTMLElement | null => {
  let n = el.parentElement;
  while (n) {
    const oy = getComputedStyle(n).overflowY;
    if (oy === 'auto' || oy === 'scroll') return n;
    n = n.parentElement;
  }
  return null;
};

/** Scroll the results until a tile for `name` is mounted, then centre it. */
async function scrollTo(page: Page, name: string): Promise<void> {
  for (let i = 0; i < 60; i += 1) {
    const found = await page.evaluate(
      ({ name, find }) => {
        const scroller = new Function('el', `return (${find})(el)`) as (el: Element) => HTMLElement | null;
        const img = document.querySelector<HTMLImageElement>(`img[alt="${name}"]`);
        if (img) {
          img.scrollIntoView({ block: 'center' });
          return true;
        }
        const cell = document.querySelector('[data-row-cell]');
        const s = cell ? scroller(cell) : null;
        if (!s) return false;
        s.scrollTop += s.clientHeight * 0.8;
        return false;
      },
      { name, find: scrollerOf.toString() },
    );
    await page.waitForTimeout(150);
    if (found) break;
  }
  await page.waitForTimeout(400);
}

/**
 * The rendered rows of the grid holding `name`, top to bottom, each as the
 * sprite names of its cells in order, with '·' for an empty cell.
 */
const rowsAround = (page: Page, name: string) =>
  page.evaluate((name) => {
    const img = document.querySelector(`img[alt="${name}"]`);
    const grid = img?.closest('[data-row-cell]')?.parentElement;
    if (!grid) return [] as string[][];
    const byTop = new Map<number, string[]>();
    for (const child of grid.children) {
      if (child.hasAttribute('aria-hidden')) continue; // a window filler
      const top = Math.round(child.getBoundingClientRect().top);
      const sprite = [...child.querySelectorAll('img')].find((i) => (i.getAttribute('src') ?? '').includes('/sprites/pokemon/'));
      const label = child.hasAttribute('data-row-cell') ? (sprite?.getAttribute('alt') ?? '?') : '·';
      const row = byTop.get(top);
      if (row) row.push(label);
      else byTop.set(top, [label]);
    }
    return [...byTop.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
  }, name);

test.describe('the one-Pokémon pickers', () => {
  test('the ace and partner pickers name their slot', async ({ page }, info) => {
    const desktop = (info.project.use.viewport?.width ?? 0) >= 1024;
    await openCard(page, 9);
    await openPicker(page, 'slot-ace');
    expect(await heading(page, desktop)).toContain('Ace Pokémon');
    if (!desktop) await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await openPicker(page, 'slot-partner');
    expect(await heading(page, desktop)).toContain('Partner / Shouldermon');
  });

  test('a chain wider than the grid leaves no gap in the rows after it', async ({ page }) => {
    await openCard(page, 9);
    await openPicker(page, 'slot-ace');
    await scrollTo(page, 'eevee');
    const rows = await rowsAround(page, 'eevee');
    expect(rows.length, 'rows were rendered around Eevee').toBeGreaterThan(3);

    // An empty cell only ever ends a row.
    const gapped = rows.filter((row) => row.some((cell, i) => cell === '·' && row.slice(i + 1).some((c) => c !== '·')));
    expect(gapped, `rows with a gap before a tile: ${JSON.stringify(gapped)}`).toEqual([]);
    // And no visual row holds more than the grid's columns.
    expect(Math.max(...rows.map((r) => r.length)), 'no row wider than the grid').toBeLessThanOrEqual(6);

    // The row from the report: Omastar's neighbour is Kabuto.
    const omastar = rows.find((row) => row.includes('omastar'));
    expect(omastar, 'Omastar is in a rendered row').toBeDefined();
    expect(omastar![omastar!.indexOf('omastar') + 1], `Omastar's row: ${omastar!.join(', ')}`).toBe('kabuto');
  });
});
