import { expect, test, type Page } from './support/test';
import { blankLeague } from './support/leagueSeed';

const openCard = async (page: Page, slot: number) => {
  await blankLeague(page);
  await page.goto('/custom-gym-leader');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.click(`[data-testid="league-slot-${slot}"]`);
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(400);
};

const openPicker = async (page: Page, slot: 'slot-ace' | 'slot-partner') => {
  await page.click(
    `[data-testid="${slot}"]`,
    slot === 'slot-ace' ? { position: { x: 8, y: 8 } } : {},
  );
  await page.waitForSelector('[data-filter-chip="my-dex"]');
  await page.waitForTimeout(600);
};

const heading = (page: Page, desktop: boolean) =>
  desktop
    ? page.locator('h2', { hasText: 'Adding to:' }).first().innerText()
    : page.locator('[data-filter-chip="my-dex"]').evaluate((chip) => {
        const sheet = chip.closest('[role="dialog"]') ?? document.body;
        const spans = [...sheet.querySelectorAll('span')];
        const lead = spans.find((s) => s.textContent?.trim() === 'Adding to:');
        return lead?.parentElement?.textContent?.replace(/\s+/g, ' ').trim() ?? '(no heading)';
      });

const scrollerOf = (el: Element): HTMLElement | null => {
  let n = el.parentElement;
  while (n) {
    const oy = getComputedStyle(n).overflowY;
    if (oy === 'auto' || oy === 'scroll') return n;
    n = n.parentElement;
  }
  return null;
};

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

const rowsAround = (page: Page, name: string) =>
  page.evaluate((name) => {
    const img = document.querySelector(`img[alt="${name}"]`);
    const grid = img?.closest('[data-row-cell]')?.parentElement;
    if (!grid) return [] as string[][];
    const byTop = new Map<number, string[]>();
    for (const child of grid.children) {
      if (child.hasAttribute('aria-hidden')) continue;
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
  test('the ace and partner pickers name their slot', { tag: '@viewport' }, async ({ page }, info) => {
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
    await scrollTo(page, 'Eevee');
    const rows = await rowsAround(page, 'Eevee');
    expect(rows.length, 'rows were rendered around Eevee').toBeGreaterThan(3);

    const gapped = rows.filter((row) => row.some((cell, i) => cell === '·' && row.slice(i + 1).some((c) => c !== '·')));
    expect(gapped, `rows with a gap before a tile: ${JSON.stringify(gapped)}`).toEqual([]);
    expect(Math.max(...rows.map((r) => r.length)), 'no row wider than the grid').toBeLessThanOrEqual(6);

    const omastar = rows.find((row) => row.includes('Omastar'));
    expect(omastar, 'Omastar is in a rendered row').toBeDefined();
    expect(omastar![omastar!.indexOf('Omastar') + 1], `Omastar's row: ${omastar!.join(', ')}`).toBe('Kabuto');
  });
});
