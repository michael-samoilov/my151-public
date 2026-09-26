import { expect, test, type Page } from '@playwright/test';
import { blankLeague } from './support/leagueSeed';

/**
 * The two-bar chrome's one hard invariant: the tool bar's three cells —
 * title/count left, view nav centred, page controls right — never overlap,
 * at any project width (320 included) and in both left-cell states (the
 * "Dex Builder" default and the n/151 count). The active tab's label
 * expands from 380px; this is what proves that expansion still leaves
 * enough room even when the count is four digits.
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

/** Same dex with analytics already unlocked, so all three tabs navigate. */
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

/**
 * Stamp a 4-digit count into the header without placing 1025 tiles.
 * The overlap risk is the glyph width of `1025/151`, not the grid.
 */
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

/**
 * The view switcher is a tab set, not a lone primary button beside ghost text.
 * Fails on the old chrome: active uses the filled `default` variant (primary)
 * while the rest are transparent ghosts.
 */
async function expectMutualTabSet(page: Page) {
  const report = await page.evaluate(() => {
    const TRANSPARENT = new Set(['rgba(0, 0, 0, 0)', 'transparent', '']);
    const navs = [...document.querySelectorAll<HTMLElement>('[data-nav]')];
    const list = document.querySelector('[role="tablist"]');
    const primary = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
    const parse = (css: string) => {
      const rgb = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
      const hex = css.trim();
      if (hex.startsWith('#') && (hex.length === 4 || hex.length === 7)) {
        const n = hex.length === 4
          ? hex.slice(1).split('').map((c) => c + c).join('')
          : hex.slice(1);
        return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
      }
      return null;
    };
    const near = (a: number[] | null, b: number[] | null) =>
      !!a && !!b && a.every((v, i) => Math.abs(v - b[i]) <= 2);

    const labelShown = (btn: HTMLElement) =>
      [...btn.querySelectorAll('span')].some((s) => {
        const r = s.getBoundingClientRect();
        const st = getComputedStyle(s);
        return r.width > 4 && st.opacity !== '0' && st.display !== 'none' && st.visibility !== 'hidden';
      });

    const selected = navs.filter((b) => b.getAttribute('aria-selected') === 'true');
    const active = selected[0]
      ?? navs.find((b) => {
        const bg = getComputedStyle(b).backgroundColor.trim();
        return !TRANSPARENT.has(bg);
      })
      ?? navs[0];
    const others = navs.filter((b) => b !== active);
    const activeBg = active ? getComputedStyle(active).backgroundColor.trim() : '';
    const othersGhost = others.every((b) => TRANSPARENT.has(getComputedStyle(b).backgroundColor.trim()));
    const loneButton = othersGhost && near(parse(activeBg), parse(primary));
    const shown = navs.map(labelShown);
    const activeIdx = active ? navs.indexOf(active) : -1;
    const heights = navs.map((b) => b.getBoundingClientRect().height);
    const width = window.innerWidth;

    return {
      navCount: navs.length,
      inList: !!list && navs.every((n) => list.contains(n)),
      listHasTrack: !!list && !TRANSPARENT.has(getComputedStyle(list).backgroundColor.trim()),
      roles: navs.map((b) => b.getAttribute('role')),
      selectedCount: selected.length,
      loneButton,
      labelsShown: shown,
      activeLabelShown: activeIdx >= 0 ? shown[activeIdx] : false,
      width,
      heights,
      heightDelta: heights.length ? Math.max(...heights) - Math.min(...heights) : 0,
    };
  });

  expect(report.navCount, 'three view tabs').toBe(3);
  expect(report.inList, 'every tab sits in one tablist').toBe(true);
  expect(report.listHasTrack, 'the tablist paints a shared track').toBe(true);
  expect(report.roles, 'each control is a tab').toEqual(['tab', 'tab', 'tab']);
  expect(report.selectedCount, 'exactly one selected tab').toBe(1);
  expect(report.loneButton, 'active tab must not be a lone primary button').toBe(false);
  if (report.width >= 380) {
    expect(report.activeLabelShown, `active tab names itself at ${report.width}px`).toBe(true);
  }
  if (report.width >= 640) {
    expect(report.labelsShown.every(Boolean), `every label shows at ${report.width}px, shown=${report.labelsShown}`).toBe(true);
  }
  expect(report.heightDelta, `tab heights ${report.heights.join(',')}`).toBeLessThanOrEqual(1);
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
  test('dex view tabs are a mutual set and miss the ribbon, including a 4-digit count', async ({ page }) => {
    test.setTimeout(60_000);
    await seedDexAndOpen(page);

    for (const width of [390, 1280] as const) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(200);

      for (const v of ['builder', 'analytics', 'view'] as const) {
        await page.click(`[data-nav="${v}"]`);
        await page.waitForTimeout(400);
        await expectMutualTabSet(page);
        await expectNoOverlap(page);
        await stampFourDigitCount(page);
        await expectNoOverlap(page);
      }
    }
  });

  test('dex tool bar never overlaps, in both title states and on every view', async ({ page }) => {
    await page.goto('/pokedex-builder');
    await page.waitForSelector('[data-testid="tool-title"]');

    // Default state: the tool's name, no selections yet.
    await expect(page.getByTestId('tool-title')).toContainText('Custom Pokédex Builder');
    await expectNoOverlap(page);

    // Seed a dex past the analytics unlock, reload into the count state.
    await page.waitForFunction((k) => !!localStorage.getItem(k), STORE_KEY);
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE_KEY, SEED]);
    await page.waitForTimeout(400);
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE_KEY, SEED]);
    // A dex saved before the page opened summons the one-time gym leader
    // callout on Tools; this test is about the bars, so mark it seen.
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
