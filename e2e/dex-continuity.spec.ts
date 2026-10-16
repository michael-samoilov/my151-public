import { expect, test } from '@playwright/test';

const STORE_KEY = 'personal-151-pokedex-v3';
const SEEDED = JSON.stringify({
  state: {
    sections: { starter: [1, 4, 7], 'regional-bird': [16, 17, 18], other: [25, 133, 143] },
    milestoneMax: 9,
    milestoneCelebrated: [],
  },
  version: 10,
});

test.describe('dex continuity across the move', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-08T12:00:00Z'));
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    );
    await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [STORE_KEY, SEEDED] as const);
  });

  test('the hub reads the saved dex and does not rewrite it', { tag: '@ci-smoke' }, async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.locator('[data-card-panel]')).toHaveCount(4);
    await expect(page.locator('h2', { hasText: 'Pokédex Maker' }).locator('..')).toContainText('9/151');
    await expect(page.getByTestId('favorites-launch-notice')).toContainText('Favorite Pokémon Picker');
    await page.waitForTimeout(500);
    const stored = await page.evaluate((k) => localStorage.getItem(k), STORE_KEY);
    expect(JSON.parse(stored!).state.sections).toEqual(JSON.parse(SEEDED).state.sections);
    await testInfo.attach('critical-journey', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('the picker launch notice shows once', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('favorites-launch-notice')).toBeVisible();
    await page.getByTestId('favorites-launch-notice').getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByTestId('favorites-launch-notice')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('[data-card-panel]')).toHaveCount(4);
    await expect(page.getByTestId('favorites-launch-notice')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('p151-league-promo-seen'))).toBe('1');
  });

  test('the builder at its new path opens the same dex, every section in order', { tag: '@ci-smoke' }, async ({ page }, testInfo) => {
    await page.goto('/pokedex-builder');
    await expect(page.getByTestId('tool-title')).toContainText('9/151');
    const sections = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).state.sections, STORE_KEY);
    expect(sections).toEqual(JSON.parse(SEEDED).state.sections);
    await testInfo.attach('critical-journey', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('a visitor with no dex sees no notice', async ({ page, context }) => {
    await context.addInitScript((k) => localStorage.removeItem(k), STORE_KEY);
    await page.goto('/');
    await expect(page.locator('[data-card-panel]')).toHaveCount(4);
    await expect(page.getByTestId('favorites-launch-notice')).toHaveCount(0);
  });
});
