import { expect, test, type Page } from './support/test';
import { blankLeague } from './support/leagueSeed';

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

const UNLOCKED_SEED = JSON.stringify({
  state: {
    ...JSON.parse(SEED).state,
    milestoneMax: 25,
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
    const list = document.querySelector('[role="tablist"]');
    const navs = [...document.querySelectorAll('[data-nav]')].map((b) => b.getBoundingClientRect());
    const navBox = list ? list.getBoundingClientRect() : {
      left: Math.min(...navs.map((r) => r.left)),
      right: Math.max(...navs.map((r) => r.right)),
      top: Math.min(...navs.map((r) => r.top)),
    };
    const bar = document.querySelector('[data-testid="tool-title"]')!.parentElement!.getBoundingClientRect();
    return {
      title: JSON.parse(JSON.stringify(title)),
      navLeft: navBox.left,
      navRight: navBox.right,
      navTop: navBox.top,
      actions: JSON.parse(JSON.stringify(actions)),
      barHeight: bar.height,
    };
  });
}

async function expectNoOverlap(page: Page) {
  const c = await readCells(page);
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
  const rootPx = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
  expect(Math.abs(c.barHeight - 2.75 * rootPx)).toBeLessThan(1.5);
}

async function stampFourDigitCount(page: Page) {
  const ok = await page.evaluate(() => {
    const n = document.querySelector('[data-testid="tool-title"] .text-primary');
    if (!n) return false;
    n.textContent = '1025';
    return true;
  });
  expect(ok).toBe(true);
  await expect(page.getByTestId('tool-title')).toContainText('1025/151');
}

async function seedDexAndOpen(page: Page, seed = UNLOCKED_SEED) {
  await page.goto('/pokedex-builder');
  await page.waitForSelector('[data-testid="tool-title"]');
  await page.waitForFunction((k) => !!localStorage.getItem(k), STORE_KEY);
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE_KEY, seed]);
  await page.evaluate(() => localStorage.setItem('p151-league-promo-seen', '1'));
  await page.reload();
  await page.waitForSelector('[data-testid="tool-title"]');
  await expect(page.getByTestId('tool-title')).toContainText('/151');
}

test.describe('two-bar chrome', { tag: '@viewport' }, () => {
  test('dex view tabs miss the ribbon, including a 4-digit count', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await seedDexAndOpen(page);

    const checked: string[] = [];
    for (const width of [390, 1280] as const) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(200);

      for (const v of ['builder', 'analytics', 'view'] as const) {
        await page.click(`[data-nav="${v}"]`);
        await page.waitForTimeout(400);
        await expectNoOverlap(page);
        await stampFourDigitCount(page);
        await expectNoOverlap(page);
        checked.push(`${width}:${v}`);
      }
    }
    await testInfo.attach('checked-views.json', {
      body: JSON.stringify({ checked }),
      contentType: 'application/json',
    });
  });

  test('dex tool bar never overlaps, in both title states and on every view', async ({ page }) => {
    await page.goto('/pokedex-builder');
    await page.waitForSelector('[data-testid="tool-title"]');

    await expect(page.getByTestId('tool-title')).toContainText('Custom Pokédex Maker');
    await expectNoOverlap(page);

    await page.waitForFunction((k) => !!localStorage.getItem(k), STORE_KEY);
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE_KEY, SEED]);
    await page.waitForTimeout(400);
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE_KEY, SEED]);
    await page.evaluate(() => localStorage.setItem('p151-league-promo-seen', '1'));
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
    const barHeight = (index: number) =>
      page.evaluate(
        (i) => document.querySelectorAll('[data-testid="league-tool-bar"]')[i].getBoundingClientRect().height,
        index,
      );
    expect(Math.abs((await barHeight(0)) - 2.75 * rootPx)).toBeLessThan(1.5);

    await page.click('[data-testid="league-slot-3"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    const bars = await page.locator('[data-testid="league-tool-bar"]').count();
    expect(Math.abs((await barHeight(bars - 1)) - 2.75 * rootPx)).toBeLessThan(1.5);
  });
});
