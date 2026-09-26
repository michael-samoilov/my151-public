import { expect, test, type Page } from '@playwright/test';
import { blankLeague } from './support/leagueSeed';

/**
 * A line picked twice.
 *
 * A gym can field two Geodudes, so a second tap on a placed line adds another
 * of it. Three things went wrong with that second tap and each is checked
 * here against the store and the screen:
 *
 * - The sheet stayed up. A first pick closed it; the repeat tap took the
 *   picker's removal path, which returned without closing.
 * - The second line was Geodude alone on every row. The removal path hands
 *   over one id, the first the card has, which for a placed line is its
 *   root, and the branch ending at a root is the root by itself.
 * - The red cross on the new column removed the old one. The cross removed
 *   "whichever line contains this id", and with two Geodude lines that is
 *   the first.
 */

const seats = (page: Page) =>
  page.evaluate(() => {
    const card = JSON.parse(window.localStorage.getItem('league-builder')!).state.cards[0];
    return (card.lines as { branch: number[] }[]).map((l) => l.branch);
  });

const sheetOpen = (page: Page) => page.evaluate(() => !!document.querySelector('[data-filter-chip="my-dex"]'));

/** Open the picker from an empty cell, search, and tap the first line tile. */
async function pick(page: Page, query: string): Promise<void> {
  await page.click('[data-testid="card-cell-4-3"]');
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
  await page.waitForTimeout(800);
}

test.describe('a line picked twice', () => {
  test.beforeEach(async ({ page }) => {
    await blankLeague(page);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(500);
  });

  test('the second tap seats the whole line and the sheet goes away', { tag: '@viewport' }, async ({ page }, info) => {
    await pick(page, 'geodude');
    const first = await seats(page);
    expect(first, 'the first pick seats Geodude to Golem').toEqual([[74, 75, 76]]);
    const closedAfterFirst = !(await sheetOpen(page));
    if (!closedAfterFirst) await page.keyboard.press('Escape');

    await pick(page, 'geodude');
    const second = await seats(page);
    expect(second, 'the second pick seats another whole line').toEqual([[74, 75, 76], [74, 75, 76]]);
    // On desktop the picker is a pane that stays for the next pick; on a
    // phone it is a sheet, and the second tap dismisses it like the first.
    const desktop = (info.project.use.viewport?.width ?? 0) >= 1024;
    if (!desktop) expect(await sheetOpen(page), 'the sheet is gone after the second tap').toBe(false);

    // The screen agrees: seat 2 evolves down its column like seat 1.
    const column = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="card-cell-"]')]
        .filter((el) => el.getAttribute('data-testid')!.endsWith('-2') && el.querySelector('img'))
        .map((el) => el.querySelector('img')!.getAttribute('src')!.split('/').pop()!.replace('.png', '')));
    expect(new Set(column).size, `seat 2 shows more than one stage: ${column.join(',')}`).toBeGreaterThan(1);
  });

  test('a line already on the card can replace another', async ({ page }) => {
    await pick(page, 'geodude');
    if (await sheetOpen(page)) await page.keyboard.press('Escape');
    await pick(page, 'gengar');
    if (await sheetOpen(page)) await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    expect(await seats(page)).toEqual([[74, 75, 76], [92, 93, 94]]);

    // A tap on a placed Pokémon above the boss row offers to swap its line
    // out. Gengar's line sits in seat 2.
    const gengarCell = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('[data-testid^="card-cell-"]')];
      const cell = cells.find((el) => {
        const [, , row, seat] = el.getAttribute('data-testid')!.split('-').map(Number);
        const alt = el.querySelector('img')?.getAttribute('alt') ?? '';
        return seat === 2 && row < 11 && ['gastly', 'haunter', 'gengar'].includes(alt);
      });
      return cell?.getAttribute('data-testid') ?? null;
    });
    expect(gengarCell, 'a Gengar-line cell in seat 2').not.toBeNull();
    await page.click(`[data-testid="${gengarCell}"]`);
    await page.waitForSelector('[data-filter-chip="my-dex"]');
    await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input')];
      const el = inputs[inputs.length - 1];
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      set.call(el, 'geodude');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(700);
    // Geodude's tile wears the "already placed" mark, and the picker used
    // to read that tap as "keep what is there".
    await page.click('[data-testid="verify-evo-card"]');
    await page.waitForTimeout(800);
    expect(await seats(page), 'seat 2 now holds another Geodude line').toEqual([[74, 75, 76], [74, 75, 76]]);
  });

  test('the red cross removes the column it is on', async ({ page }) => {
    // Gengar: a species with a Mega, so the newer line can be marked through
    // the card's own controls rather than through storage.
    await pick(page, 'gengar');
    if (await sheetOpen(page)) await page.keyboard.press('Escape');
    await pick(page, 'gengar');
    if (await sheetOpen(page)) await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    expect(await seats(page), 'two Gengar lines').toEqual([[92, 93, 94], [92, 93, 94]]);

    // Seat 1 is the rightmost column; the newer line is seat 2, left of it.
    // Press the Mega on the newer column's boss-row cell: the leftmost Mega
    // button on the lowest row.
    const megas = page.locator('button[data-powerup="mega"]');
    const boxes = await megas.evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y }; }));
    const lowest = Math.max(...boxes.map((b) => b.y));
    const onBoss = boxes.map((b, i) => ({ ...b, i })).filter((b) => Math.abs(b.y - lowest) < 2);
    const newer = onBoss.sort((a, b) => a.x - b.x)[0];
    await megas.nth(newer.i).evaluate((el) => (el as HTMLElement).click());
    await page.waitForTimeout(400);
    const powerups = () =>
      page.evaluate(() =>
        Object.values(JSON.parse(window.localStorage.getItem('league-builder')!).state.cards[0].powerups ?? {})
          .flat() as { seat: number; kind: string }[]);
    const marked = await powerups();
    expect(marked.length, 'the newer column carries a powerup').toBeGreaterThan(0);
    expect(marked.every((p) => p.seat === 2), `the powerup sits on seat 2: ${JSON.stringify(marked)}`).toBe(true);

    // Now the cross on the newer column, also the leftmost of its kind.
    const crosses = page.locator('button[aria-label$="\'s line"]');
    const xs = await crosses.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().x));
    await crosses.nth(xs.indexOf(Math.min(...xs))).evaluate((el) => (el as HTMLElement).click());
    await page.waitForTimeout(500);

    expect(await seats(page), 'one line is left').toEqual([[92, 93, 94]]);
    // The powerup belonged to the removed line, so it is gone. Under the
    // old removal the *older* line went, and the powerup slid to seat 1.
    expect(await powerups(), 'the removed column took its powerup with it').toEqual([]);
  });
});
