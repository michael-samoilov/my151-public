import type { Page } from '@playwright/test';

/**
 * Start the league builder on an empty template.
 *
 * A preview build seeds a Kanto league on a first visit
 * (`src/league/store/seedLeague.ts`), which is what the tool should do for a
 * person and the wrong starting point for a test: a spec that seats a
 * Pokémon in gym 1 wants gym 1 empty. Writing the key before the page loads
 * takes the "first visit" branch out of play and says what state the spec
 * starts from.
 *
 * Call it before `page.goto`.
 */
export async function blankLeague(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const cards = Array.from({ length: 14 }, () => ({
      type: null,
      theme: '',
      lines: [],
      signatureSeat: null,
      tmMoveId: null,
      badgeName: '',
      legend: null,
      powerup: null,
    }));
    window.localStorage.setItem(
      'league-builder',
      JSON.stringify({ state: { name: '', cards }, version: 1 }),
    );
  });
}

/** Start the league builder on the seeded Kanto league, whatever the visit. */
export async function seededLeague(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.removeItem('league-builder'));
}
