import { expect, test, type Page } from '@playwright/test';

/**
 * One press on a tile's X can take a whole evolution line, and Clear All takes
 * the whole dex. Both offer Undo for a few seconds. These tests hold the
 * outcome in the saved store: Undo puts back exactly what was there, without
 * touching the milestone record, and the offer goes away on its own.
 */

const STORE_KEY = 'personal-151-pokedex-v3';
// The verify-my151 standard seed: 37 placed, past the 25 milestone.
const SEED_SECTIONS: Record<string, number[]> = {
  starter: [387, 388, 389, 255, 256, 257, 656, 657, 658],
  'early-bug': [736, 737, 738, 543, 544, 545, 123, 212, 900],
  forest: [46, 47, 453, 454, 708, 709, 56, 57, 979, 273, 274, 275, 216, 217, 901, 252, 253, 254, 640],
};
const SEED = JSON.stringify({
  state: { sections: SEED_SECTIONS, milestoneMax: 37, milestoneCelebrated: [25], localeNoticeSeen: true, locale: 'en' },
  version: 10,
});
const GROTLE = '[data-tile-id="starter::388"]';

interface Saved {
  sections: Record<string, number[]>;
  milestoneMax: number;
  milestoneCelebrated: number[];
}

const saved = (page: Page) =>
  page.evaluate((k) => {
    const { state } = JSON.parse(localStorage.getItem(k)!);
    return { sections: state.sections, milestoneMax: state.milestoneMax, milestoneCelebrated: state.milestoneCelebrated };
  }, STORE_KEY) as Promise<Saved>;

const placed = (s: Saved) => Object.values(s.sections).reduce((n, ids) => n + ids.length, 0);

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  // Seed once per test, so a reload inside a test would read what the app saved.
  await page.addInitScript(([k, v]) => {
    if (sessionStorage.getItem('undo-spec-seeded')) return;
    sessionStorage.setItem('undo-spec-seeded', '1');
    localStorage.setItem(k, v);
    localStorage.setItem('p151-league-promo-seen', '1');
    localStorage.setItem('p151-moved-notice-seen', '1');
  }, [STORE_KEY, SEED] as const);
  await page.goto('/pokedex-builder');
  await page.locator(GROTLE).waitFor();
});

test('Undo after a tile X puts the whole line back', async ({ page }, testInfo) => {
  const before = await saved(page);
  expect(before.sections).toEqual(SEED_SECTIONS);

  await page.getByRole('button', { name: 'Remove Grotle', exact: true }).click();
  const status = page.getByRole('status').filter({ hasText: 'Removed the Turtwig line' });
  await expect(status).toBeVisible();
  const removed = await saved(page);

  await status.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator(GROTLE)).toBeVisible();
  await expect(status).toHaveCount(0);
  // Past the celebration's reveal delay, so a replayed one would be on screen.
  await page.waitForTimeout(1200);
  const restored = await saved(page);
  const statusShown = await page.getByRole('status').filter({ hasText: /\S/ }).count();

  const result = {
    placed: { before: placed(before), removed: placed(removed), restored: placed(restored) },
    starterAfterRemove: removed.sections.starter,
    milestone: { max: restored.milestoneMax, celebrated: restored.milestoneCelebrated },
    statusShownAfterUndo: statusShown,
  };
  await testInfo.attach('remove-undo.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });

  expect(removed.sections.starter).toEqual([255, 256, 257, 656, 657, 658]);
  expect(restored.sections).toEqual(SEED_SECTIONS);
  expect(result.milestone).toEqual({ max: 37, celebrated: [25] });
  expect(statusShown).toBe(0);
});

test('Undo after Clear All puts the whole dex back', async ({ page }, testInfo) => {
  await page.getByTestId('builder-settings').click();
  await page.getByRole('button', { name: 'Clear All' }).click();
  await page.getByRole('button', { name: 'Are you sure?' }).click();
  const status = page.getByRole('status').filter({ hasText: 'Cleared all 37 Pokémon' });
  await expect(status).toBeVisible();
  const cleared = await saved(page);

  await status.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator(GROTLE)).toBeVisible();
  await page.waitForTimeout(1200);
  const restored = await saved(page);
  const statusShown = await page.getByRole('status').filter({ hasText: /\S/ }).count();

  const result = {
    placed: { cleared: placed(cleared), restored: placed(restored) },
    milestone: { max: restored.milestoneMax, celebrated: restored.milestoneCelebrated },
    statusShownAfterUndo: statusShown,
  };
  await testInfo.attach('clear-undo.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });

  expect(result.placed.cleared).toBe(0);
  expect(restored.sections).toEqual(SEED_SECTIONS);
  expect(result.milestone).toEqual({ max: 37, celebrated: [25] });
  expect(statusShown).toBe(0);
});

test('the Undo offer leaves on its own and the removal stands', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Remove Grotle', exact: true }).click();
  const status = page.getByRole('status').filter({ hasText: 'Removed the Turtwig line' });
  await expect(status).toBeVisible();
  const shownAt = Date.now();
  // Move the pointer off the toast: a pointer on it holds the timer.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(3000);
  const stillShownAt3s = await status.isVisible();
  await expect(status).toHaveCount(0, { timeout: 10_000 });
  const goneAfterMs = Date.now() - shownAt;
  const after = await saved(page);

  await testInfo.attach('undo-timeout.json', {
    body: JSON.stringify({ stillShownAt3s, goneWithin10s: true, placedAfter: placed(after) }, null, 2),
    contentType: 'application/json',
  });

  expect(stillShownAt3s).toBe(true);
  expect(goneAfterMs).toBeLessThan(10_000);
  expect(placed(after)).toBe(34);
  await expect(page.locator(GROTLE)).toHaveCount(0);
});
