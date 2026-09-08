import { expect, test, type Page } from '@playwright/test';
import { blankLeague } from './support/leagueSeed';

/**
 * The two-bar chrome's one hard invariant: the tool bar's three cells —
 * title/count left, view nav centred, page controls right — never overlap,
 * at any project width (320 included) and in both left-cell states (the
 * "Dex Builder" default and the n/151 count). The nav labels collapse to
 * icons below 380px; this is what proves that collapse leaves enough room.
 *
 * The league builder's tool bar must also hold the same 44px height on the
 * home page and the card page, so switching tools does not jump the chrome.
 */

const STORE_KEY = 'personal-151-pokedex-v3';
const SEED = JSON.stringify({
  state: {
    sections: {
      starter: [387, 388, 389, 255, 256, 257, 656, 657, 658],
      forest: [46, 47, 453, 454, 708, 709, 56, 57, 979, 273, 274, 275],
    },
    milestoneMax: 21,
    milestoneCelebrated: [],
    localeNoticeSeen: true,
  },
  version: 10,
});

interface Cells {
  title: DOMRect;
  navLeft: number;
  navRight: number;
  navTop: number;
  actions: DOMRect;
  barHeight: number;
}

async function readCells(page: Page): Promise<Cells> {
  return page.evaluate(() => {
    const title = document.querySelector('[data-testid="tool-title"]')!.getBoundingClientRect();
    const actions = document.querySelector('[data-testid="tool-actions"]')!.getBoundingClientRect();
    const navs = [...document.querySelectorAll('[data-nav]')].map((b) => b.getBoundingClientRect());
    const bar = document.querySelector('[data-testid="tool-title"]')!.parentElement!.getBoundingClientRect();
    return {
      title: JSON.parse(JSON.stringify(title)),
      navLeft: Math.min(...navs.map((r) => r.left)),
      navRight: Math.max(...navs.map((r) => r.right)),
      navTop: Math.min(...navs.map((r) => r.top)),
      actions: JSON.parse(JSON.stringify(actions)),
      barHeight: bar.height,
    };
  });
}

async function expectNoOverlap(page: Page) {
  const c = await readCells(page);
  // The title cell's content, not the flexible cell box: an empty 1fr cell
  // legitimately reaches the nav. Content width is what must not cross.
  const titleContentRight = await page.evaluate(() => {
    const cell = document.querySelector('[data-testid="tool-title"]')!;
    const inner = cell.firstElementChild;
    return inner ? inner.getBoundingClientRect().right : cell.getBoundingClientRect().left;
  });
  expect(titleContentRight).toBeLessThanOrEqual(c.navLeft + 0.5);
  const actionsContentLeft = await page.evaluate(() => {
    const cell = document.querySelector('[data-testid="tool-actions"]')!;
    const kids = [...cell.children].map((k) => k.getBoundingClientRect().left);
    return kids.length > 0 ? Math.min(...kids) : cell.getBoundingClientRect().right;
  });
  expect(c.navRight).toBeLessThanOrEqual(actionsContentLeft + 0.5);
  // h-11 = 2.75rem; the root font-size is the app's JS sizing knob, so the
  // expected pixel height follows it (16px root -> 44, 20px root -> 55).
  const rootPx = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
  expect(Math.abs(c.barHeight - 2.75 * rootPx)).toBeLessThan(1.5);
}

test.describe('two-bar chrome', () => {
  test('dex tool bar never overlaps, in both title states and on every view', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="tool-title"]');

    // Default state: the tool's name, no selections yet.
    await expect(page.getByTestId('tool-title')).toContainText('Custom Pokédex Builder');
    await expectNoOverlap(page);

    // Seed a dex past the analytics unlock, reload into the count state.
    await page.waitForFunction((k) => !!localStorage.getItem(k), STORE_KEY);
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE_KEY, SEED]);
    await page.waitForTimeout(400);
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE_KEY, SEED]);
    await page.reload();
    await page.waitForSelector('[data-testid="tool-title"]');
    await expect(page.getByTestId('tool-title')).toContainText('/151');
    await expectNoOverlap(page);

    for (const v of ['analytics', 'view', 'builder']) {
      await page.click(`[data-nav="${v}"]`);
      await page.waitForTimeout(600);
      await expectNoOverlap(page);
    }
  });

  test('league tool bar holds the dex bar height on home and card', async ({ page }) => {
    await blankLeague(page);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    const rootPx = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
    // Both bars carry the same handle: reading up the tree from a control
    // inside them breaks the moment one of those controls grows a border.
    const barHeight = (index: number) =>
      page.evaluate(
        (i) => document.querySelectorAll('[data-testid="league-tool-bar"]')[i].getBoundingClientRect().height,
        index,
      );
    expect(Math.abs((await barHeight(0)) - 2.75 * rootPx)).toBeLessThan(1.5);

    await page.click('[data-testid="league-slot-3"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    // Mobile keeps both panes mounted, so the card's bar is the second one.
    const bars = await page.locator('[data-testid="league-tool-bar"]').count();
    expect(Math.abs((await barHeight(bars - 1)) - 2.75 * rootPx)).toBeLessThan(1.5);
  });
});
