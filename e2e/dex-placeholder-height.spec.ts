import { expect, test, type Page } from '@playwright/test';

/**
 * A dashed placeholder in the build grid is as tall as the Pokémon tiles in
 * its row, on every width. A row that holds no tile keeps its placeholders
 * square, because there is no tile height to match.
 *
 * Four cases, one seed:
 * - Starters holds the Torchic and Froakie lines, so its first row is three
 *   Grass placeholders beside Torchic, Combusken, and Blaziken.
 * - Regional Bug holds nine, so its trailing "+" shares the second row with
 *   Scyther, Scizor, and Kleavor.
 * - Domestic holds six, so its trailing "+" starts a row of its own.
 * - Meadow is empty, so its lone "+" is the only cell in its grid.
 */

const STORE_KEY = 'personal-151-pokedex-v3';
const SECTIONS: Record<string, number[]> = {
  starter: [255, 256, 257, 656, 657, 658],
  'early-bug': [736, 737, 738, 543, 544, 545, 123, 212, 900],
  'early-normal': [506, 507, 508, 298, 183, 184],
};
const PLACED = Object.values(SECTIONS).reduce((n, ids) => n + ids.length, 0);
const SEED = JSON.stringify({
  state: { sections: SECTIONS, milestoneMax: PLACED, milestoneCelebrated: [], localeNoticeSeen: true, locale: 'en' },
  version: 10,
});

interface Cell { kind: 'tile' | 'dashed'; width: number; height: number }

/** A section's grid cells, grouped into rows by their top edge. */
async function readRows(page: Page, sectionId: string): Promise<Cell[][]> {
  return page.evaluate((id) => {
    const grid = document.querySelector(`[data-section-id="${id}"] > .grid`);
    if (!grid) throw new Error(`no grid for section ${id}`);
    const rows = new Map<number, { kind: 'tile' | 'dashed'; width: number; height: number }[]>();
    for (const el of grid.children) {
      const isTile = el.matches('[data-tile-id]');
      // A tile's visible card, not its grid cell: the card is what a
      // placeholder has to line up with.
      const box = (isTile ? el.querySelector(':scope > .bg-card') ?? el : el).getBoundingClientRect();
      const top = Math.round(el.getBoundingClientRect().top);
      rows.set(top, [...(rows.get(top) ?? []), {
        kind: isTile ? 'tile' : 'dashed',
        width: Math.round(box.width * 100) / 100,
        height: Math.round(box.height * 100) / 100,
      }]);
    }
    return [...rows.entries()].sort(([a], [b]) => a - b).map(([, cells]) => cells);
  }, sectionId);
}

const tileHeight = (row: Cell[]) => Math.max(...row.filter((c) => c.kind === 'tile').map((c) => c.height));
const dashed = (row: Cell[]) => row.filter((c) => c.kind === 'dashed');

test('a placeholder beside a tile is as tall as the tile; a lone one stays square', { tag: '@viewport' }, async ({ page }, testInfo) => {
  await page.addInitScript(([key, value]) => {
    localStorage.setItem(key, value);
    localStorage.setItem('p151-league-promo-seen', '1');
  }, [STORE_KEY, SEED] as const);
  await page.goto('/pokedex-builder');
  await page.waitForSelector('[data-tile-id="early-bug::900"]');
  // The name line is a fixed-height skeleton until the catalog lands; wait
  // for the real names so the measured heights are the settled ones.
  await page.waitForFunction(() => !document.querySelector('[data-name-skeleton]'));

  const starter = await readRows(page, 'starter');
  const bug = await readRows(page, 'early-bug');
  const domestic = await readRows(page, 'early-normal');
  const meadow = await readRows(page, 'meadow');

  await testInfo.attach('placeholder-heights.json', {
    body: JSON.stringify({ viewport: page.viewportSize(), starter, bug, domestic, meadow }, null, 2),
    contentType: 'application/json',
  });

  expect(dashed(starter[0]), 'three Grass placeholders share the first Starters row').toHaveLength(3);
  for (const cell of dashed(starter[0])) {
    expect(Math.abs(cell.height - tileHeight(starter[0])), 'Grass placeholder height against the Torchic line').toBeLessThanOrEqual(1);
  }

  expect(dashed(bug[1]), 'the trailing "+" shares the second Regional Bug row').toHaveLength(1);
  expect(Math.abs(dashed(bug[1])[0].height - tileHeight(bug[1])), 'trailing "+" height against Kleavor').toBeLessThanOrEqual(1);

  const domesticPlus = domestic[1];
  expect(domesticPlus, 'the Domestic "+" starts a row with no tile').toEqual([expect.objectContaining({ kind: 'dashed' })]);
  expect(Math.abs(domesticPlus[0].width - domesticPlus[0].height), 'a "+" alone in its row stays square').toBeLessThanOrEqual(1);

  expect(meadow, 'an empty section holds one "+"').toEqual([[expect.objectContaining({ kind: 'dashed' })]]);
  expect(Math.abs(meadow[0][0].width - meadow[0][0].height), 'an empty section\'s "+" stays square').toBeLessThanOrEqual(1);
});
