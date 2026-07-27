import type { Page } from '@playwright/test';

export const NAV_PAGES = ['builder', 'view', 'analytics'] as const;
export type NavPage = (typeof NAV_PAGES)[number];

/** `?tune` is what exposes `window.__pokedexStore` (see MilestoneBar.tsx:170). */
export const TUNE_URL = '/?tune';

interface Rect {
  left: number;
  right: number;
  top: number;
  width: number;
  height: number;
}

export interface HeaderMetrics {
  counter: Rect | null;
  bar: Rect;
  control: Rect | null;
  row: Rect;
  dividers: Rect[];
  /** Extent of the bar's own painted content — the end beads are its widest part. */
  barVisual: { left: number; right: number } | null;
}

/**
 * Seed 100 placed Pokémon so Analytics is unlocked and every page renders its
 * header row. Milestones are pre-marked celebrated so no popup covers the bar.
 */
export async function seedDex(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = (window as unknown as { __pokedexStore: {
      getState: () => { sections: Record<string, number[]> };
      setState: (patch: Record<string, unknown>) => void;
    } }).__pokedexStore;
    const sections = store.getState().sections;
    store.setState({
      sections: { ...sections, other: Array.from({ length: 100 }, (_, i) => i + 1) },
      milestoneMax: 100,
      milestoneCelebrated: [25, 100],
      milestoneCelebration: null,
    });
  });
  await page.waitForFunction(() => document.querySelectorAll('.milestone-bar').length > 0);
}

export async function gotoPage(page: Page, nav: NavPage): Promise<void> {
  await page.locator(`[data-nav="${nav}"]`).click();
  // The bar animates on mount; settle before measuring.
  await page.waitForTimeout(500);
}

/**
 * Measure the milestone bar's own header row — the per-page `n/151` row, NOT
 * the app's top nav <header>. Everything measured is a true row sibling of the
 * bar, so a counter and a bar on different rows can't produce a false pass.
 */
export async function measureHeader(page: Page): Promise<HeaderMetrics> {
  return page.evaluate(() => {
    const R = (el: Element): Rect => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, width: r.width, height: r.height };
    };

    const bar = Array.from(document.querySelectorAll('.milestone-bar')).find(
      (b) => b.getBoundingClientRect().width > 0,
    );
    if (!bar) throw new Error('no visible .milestone-bar on this page');

    const barCell = bar.parentElement!;
    const row = barCell.parentElement!;
    const kids = Array.from(row.children);
    const counter = kids.find((c) => /\/151/.test(c.textContent ?? '')) ?? null;
    const control = kids[kids.indexOf(barCell) + 1] ?? null;

    // The two 1px-wide absolutely-positioned children of .milestone-bar.
    const dividers = Array.from(bar.children)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width <= 1.5 && r.height > 4;
      })
      .map(R)
      .sort((a, b) => a.left - b.left);

    let vl = Infinity;
    let vr = -Infinity;
    const walk = (el: Element) => {
      for (const c of Array.from(el.children)) {
        const r = c.getBoundingClientRect();
        if (r.width > 1.5) {
          vl = Math.min(vl, r.left);
          vr = Math.max(vr, r.right);
        }
        walk(c);
      }
    };
    walk(bar.querySelector('[style*="margin"]') ?? bar);

    return {
      counter: counter ? R(counter) : null,
      bar: R(bar),
      control: control ? R(control) : null,
      row: R(row),
      dividers,
      barVisual: vl === Infinity ? null : { left: vl, right: vr },
    };
  });
}
