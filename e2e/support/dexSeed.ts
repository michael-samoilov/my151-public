import type { Page } from '@playwright/test';

export const NAV_PAGES = ['builder', 'view', 'analytics'] as const;
export type NavPage = (typeof NAV_PAGES)[number];

/**
 * `?tune` is what exposes `window.__pokedexStore` (see MilestoneBar.tsx).
 *
 * The milestone progress bar itself is retired — the header now carries the
 * count alone — so this module is only the dex seed it always also was. The
 * `?tune` panel it hangs off is dev-only and still mounted.
 */
export const TUNE_URL = '/pokedex-builder?tune';

/**
 * Seed 100 placed Pokémon so Analytics is unlocked and every page renders.
 * Milestones are pre-marked celebrated so no popup covers the page.
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
  // The header's count is the seed's visible effect. It reads 0/151 before
  // the seed, so wait for a non-zero count, not for any count.
  await page.waitForFunction(
    () => /[1-9]\d*\/151/.test(document.querySelector('[data-testid="tool-title"]')?.textContent ?? ''),
  );
}

export async function gotoPage(page: Page, nav: NavPage): Promise<void> {
  await page.locator(`[data-nav="${nav}"]`).click();
  await page.waitForTimeout(300);
}
