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

/** Start the league builder on a gym card with a chosen ace and partner. */
export async function pairLeague(
  page: Page,
  aceId: number | null,
  partnerId: number | null,
): Promise<void> {
  await page.addInitScript(({ aceId, partnerId }) => {
    const empty = {
      type: null as string | null,
      theme: '',
      lines: [] as { branch: number[]; boundaries: number[] }[],
      signatureSeat: null as number | null,
      signatureId: null as number | null,
      partnerId: null as number | null,
      tmMoveId: null as number | null,
      badgeName: '',
      legend: null,
      powerup: null,
    };
    const cards = Array.from({ length: 14 }, () => ({ ...empty, lines: [] as typeof empty.lines }));
    cards[0] = {
      ...empty,
      type: 'bug',
      theme: 'Metamorphosis Bugs',
      lines: aceId !== null ? [{ branch: [aceId], boundaries: [1] }] : [],
      signatureSeat: aceId !== null ? 1 : null,
      signatureId: aceId,
      partnerId,
    };
    window.localStorage.setItem(
      'league-builder',
      JSON.stringify({ state: { name: '', cards }, version: 1 }),
    );
  }, { aceId, partnerId });
}

/** Start the league builder on a gym card one line short of a full team. */
export async function fiveLineCardLeague(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const empty = {
      type: null as string | null,
      theme: '',
      lines: [] as { branch: number[]; boundaries: number[] }[],
      signatureSeat: null as number | null,
      tmMoveId: null as number | null,
      badgeName: '',
      legend: null,
      powerup: null,
    };
    const line = (id: number) => ({ branch: [id], boundaries: [1] });
    const cards = Array.from({ length: 14 }, () => ({ ...empty, lines: [] as typeof empty.lines }));
    cards[0] = { ...empty, lines: [line(1), line(4), line(7), line(10), line(16)] };
    window.localStorage.setItem(
      'league-builder',
      JSON.stringify({ state: { name: '', cards }, version: 1 }),
    );
  });
}

/** Start with seven gym-leader slots filled, so the eighth crossing is live. */
export async function sevenGymsLeague(page: Page): Promise<void> {
  await filledSlotsLeague(page, [0, 1, 2, 3, 4, 5, 6]);
}

/** Start with one line on each listed slot and every other slot empty. */
export async function filledSlotsLeague(page: Page, slots: readonly number[]): Promise<void> {
  await page.addInitScript((filled) => {
    const empty = {
      type: null as string | null,
      theme: '',
      lines: [] as { branch: number[]; boundaries: number[] }[],
      signatureSeat: null as number | null,
      tmMoveId: null as number | null,
      badgeName: '',
      legend: null,
      powerup: null,
    };
    const line = (id: number) => ({ branch: [id], boundaries: [1] });
    const cards = Array.from({ length: 14 }, () => ({ ...empty, lines: [] as typeof empty.lines }));
    for (const i of filled) cards[i] = { ...empty, lines: [line(i + 1)] };
    window.localStorage.setItem(
      'league-builder',
      JSON.stringify({ state: { name: '', cards }, version: 1 }),
    );
  }, slots);
}

/**
 * Start with all 14 trainer cards at six lines but one, which has five.
 * A version 1 save, so the store's migration marks every export popup as
 * played, and none covers the league summary. Seeds once per tab, so a
 * reload keeps what the page saved.
 */
export async function oneLineShortLeague(page: Page, shortSlot: number): Promise<void> {
  await page.addInitScript((short) => {
    if (sessionStorage.getItem('league-seeded')) return;
    sessionStorage.setItem('league-seeded', '1');
    const line = (id: number) => ({ branch: [id], boundaries: [1] });
    const team = [1, 4, 7, 25, 133, 143].map(line);
    const cards = Array.from({ length: 14 }, (_, i) => ({
      type: null,
      theme: '',
      lines: i === short ? team.slice(0, 5) : team,
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
  }, shortSlot);
}

/** Start the league builder on the seeded Kanto league, whatever the visit. */
export async function seededLeague(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.removeItem('league-builder'));
}
