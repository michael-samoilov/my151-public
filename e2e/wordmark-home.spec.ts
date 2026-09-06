import { test, expect } from '@playwright/test';
import { seedDex, TUNE_URL } from './support/milestoneHeader';

/**
 * The wordmark is the way back to the router page, from every view.
 *
 * It is a link rather than a view switch on purpose: the router is a separate
 * entry point, not a fourth tab. The Pokédex lives in localStorage, so the full
 * navigation this causes loses nothing.
 *
 * The href is a query today because the router page has no route of its own —
 * see docs/future-tools/home-page/README.md. This asserts the behaviour, not
 * that shape: when the page gets a real path, only HOME_HREF and this constant
 * change.
 */
const HOME_HREF = '/?home';

const VIEWS = ['builder', 'view', 'analytics'] as const;

test.describe('wordmark links home', () => {
  test('the wordmark is a link, and it names the site', async ({ page }) => {
    await page.goto('/');
    const link = page.locator('h1 a');
    await expect(link).toHaveAttribute('href', HOME_HREF);
    // The h1 stays the heading; the link sits inside it.
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(link).toContainText('my151');
    // The screen-reader tagline rides along, so the link is not named "my151.app"
    // alone — that says nothing about where it goes.
    await expect(link).not.toHaveText('my151.app');
  });

  for (const view of VIEWS) {
    test(`the wordmark still links home from the ${view} view`, async ({ page }) => {
      // `?tune` is the only surface that exposes the store, which is how the
      // milestone sweep seeds too. Analytics is locked below 25 Pokémon, and a
      // locked tab only opens a tooltip — without seeding, this test would run
      // on the builder view three times over and prove nothing.
      await page.goto(TUNE_URL);
      await seedDex(page);
      const tab = page.locator(`[data-nav="${view}"]`).first();
      await tab.click();
      // The active tab is the filled one and the rest are ghosts. There is no
      // `data-active` to read, and the exact colour is a moving target — the
      // computed value comes back in oklab, and the pointer left after the
      // click adds a hover alpha. So compare filled against transparent, which
      // is the actual signal that the view switched.
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
      await expect(page.locator('h1 a')).toHaveAttribute('href', HOME_HREF);
    });
  }

  test('following it reaches the router page', async ({ page }) => {
    await page.goto('/');
    await page.locator('h1 a').click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\?home$/);
    // The router page's own heading, not the app's wordmark.
    await expect(page.locator('h1')).toContainText('Pokédex');
    await expect(page.locator('[data-card-panel]')).toHaveCount(4);
  });

});
