import { test, expect } from '@playwright/test';
import { seedDex, TUNE_URL } from './support/dexSeed';

const HOME_HREF = '/';
const DEX_URL = '/pokedex-builder';

const VIEWS = ['builder', 'view', 'analytics'] as const;

test.describe('wordmark links home', () => {
  test('the wordmark is a link, and it names the site', async ({ page }) => {
    await page.goto(DEX_URL);
    const link = page.getByTestId('wordmark');
    await expect(link).toHaveAttribute('href', HOME_HREF);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('Custom Pokédex Maker');
    await expect(link).toContainText('my151');
    await expect(link).not.toHaveText('my151.app');
  });

  for (const view of VIEWS) {
    test(`the wordmark still links home from the ${view} view`, async ({ page }) => {
      await page.goto(TUNE_URL);
      await seedDex(page);
      const tab = page.locator(`[data-nav="${view}"]`).first();
      await tab.click();
      await page.mouse.move(0, 0);
      await expect
        .poll(() =>
          page.evaluate((active) => {
            const bg = (v: string) => {
              const el = document.querySelector(`[data-nav="${v}"]`);
              return el ? getComputedStyle(el).backgroundColor : null;
            };
            const others = ['builder', 'view', 'analytics'].filter((v) => v !== active);
            return {
              activeFilled: bg(active) !== 'rgba(0, 0, 0, 0)',
              othersGhosted: others.every((v) => bg(v) === 'rgba(0, 0, 0, 0)'),
            };
          }, view),
        )
        .toEqual({ activeFilled: true, othersGhosted: true });
      await expect(page.getByTestId('wordmark')).toHaveAttribute('href', HOME_HREF);
    });
  }

  test('following it reaches the hub', { tag: '@ci-smoke' }, async ({ page }, testInfo) => {
    await page.goto(DEX_URL);
    await page.getByTestId('wordmark').click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('h1')).toContainText('Pokédex');
    await expect(page.locator('[data-card-panel]')).toHaveCount(4);
    await testInfo.attach('critical-journey', { body: await page.screenshot(), contentType: 'image/png' });
  });

});
