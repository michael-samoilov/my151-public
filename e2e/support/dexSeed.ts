import type { Page } from '@playwright/test';

export const NAV_PAGES = ['builder', 'view', 'analytics'] as const;

export const TUNE_URL = '/pokedex-builder?tune';

export async function seedDex(page: Page): Promise<void> {
  await page.waitForFunction(() => '__pokedexStore' in window);
  await page.evaluate(() => {
    localStorage.setItem('p151-league-promo-seen', '1');
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
  await page.waitForFunction(
    () => /[1-9]\d*\/151/.test(document.querySelector('[data-testid="tool-title"]')?.textContent ?? ''),
  );
}

