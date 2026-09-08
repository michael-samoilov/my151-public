import { expect, test } from '@playwright/test';

/**
 * The callout in the dex builder that points a returning visitor at the gym
 * leader maker. Once per browser, only for a dex saved before the page
 * opened, and never after the hub already showed the gym leader card.
 */
const STORE_KEY = 'personal-151-pokedex-v3';
const SEEDED = JSON.stringify({ state: { sections: { starter: [1, 4, 7] }, milestoneMax: 3, milestoneCelebrated: [] }, version: 10 });

test.describe('gym leader maker callout', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    );
  });

  test('a saved dex sees it once, and it links with the tool\'s name', async ({ page }) => {
    await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [STORE_KEY, SEEDED] as const);
    await page.goto('/pokedex-builder');
    const promo = page.getByTestId('league-promo');
    await expect(promo).toBeVisible();
    await expect(promo.getByRole('link')).toHaveAttribute('href', '/custom-gym-leader');
    await expect(promo.getByRole('link')).toHaveText('Custom Gym Leader & Trainer Card Maker');
    await page.reload();
    await expect(page.getByTestId('tool-title')).toContainText('3/151');
    await expect(page.getByTestId('league-promo')).toHaveCount(0);
  });

  test('dismiss hides it for good', async ({ page }) => {
    await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [STORE_KEY, SEEDED] as const);
    await page.goto('/pokedex-builder');
    await page.getByTestId('league-promo').getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByTestId('league-promo')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('p151-league-promo-seen'))).toBe('1');
  });

  test('a new visitor never sees it, even after placing a Pokémon', async ({ page }) => {
    await page.goto('/pokedex-builder?tune');
    await expect(page.getByTestId('tool-title')).toContainText('0/151');
    await expect(page.getByTestId('league-promo')).toHaveCount(0);
    await page.evaluate(() => {
      const store = (window as unknown as { __pokedexStore: { setState: (p: object) => void } }).__pokedexStore;
      store.setState({ sections: { starter: [1] } });
    });
    await expect(page.getByTestId('tool-title')).toContainText('1/151');
    await expect(page.getByTestId('league-promo')).toHaveCount(0);
  });

  test('the hub having shown the card is enough', async ({ page }) => {
    await page.addInitScript(([k, v]) => {
      localStorage.setItem(k, v);
      localStorage.setItem('p151-league-promo-seen', '1');
    }, [STORE_KEY, SEEDED] as const);
    await page.goto('/pokedex-builder');
    await expect(page.getByTestId('tool-title')).toContainText('3/151');
    await expect(page.getByTestId('league-promo')).toHaveCount(0);
  });
});
