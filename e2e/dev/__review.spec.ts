import { test, type Page } from '@playwright/test';

/**
 * Throwaway: before/after pairs for design review.
 * BEFORE is a dev server on the deploy branch (port 4180), AFTER is this branch.
 */

const OUT = '/tmp/claude-0/-home-user-my151/e4cff3a4-b77d-5404-aadd-bcb4d9bb2d7a/scratchpad/review';
const BEFORE = 'http://localhost:4180';

async function muteApi(page: Page) {
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, body: '{}' }));
}

/** The old build had no accessible name on the add-slot button; match by shape. */
const ADD_SLOT = 'button.border-dashed, [data-add-slot]';

async function openTypeFilter(page: Page) {
  await page.locator(ADD_SLOT).last().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Type', exact: true }).first().click();
  await page.waitForTimeout(700);
}

test.describe('review shots', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('type badges', async ({ page }) => {
    await muteApi(page);

    await page.goto(`${BEFORE}/`);
    await openTypeFilter(page);
    await page.locator('.grid.grid-cols-3').first()
      .screenshot({ path: `${OUT}/01-badges-BEFORE.png`, scale: 'device' });

    await page.goto('/');
    await openTypeFilter(page);
    await page.locator('[data-testid="type-filter"]')
      .screenshot({ path: `${OUT}/02-badges-AFTER.png`, scale: 'device' });
  });

  test('tiles', async ({ page }) => {
    await muteApi(page);
    for (const [tag, url] of [['03-BEFORE', `${BEFORE}/`], ['04-AFTER', '/']] as const) {
      await page.goto(url);
      await page.locator(ADD_SLOT).last().click();
      await page.waitForTimeout(700);
      // That slot arrives with its section's filter applied; clear it so the
      // grid is full and the two builds show the same Pokémon.
      await page.getByRole('button', { name: 'Clear', exact: true }).first().click();
      await page.waitForTimeout(1400);
      await page.screenshot({
        path: `${OUT}/${tag}-tiles.png`,
        clip: { x: 655, y: 250, width: 625, height: 380 },
      });
    }
  });

  test('header widths', async ({ page }) => {
    await muteApi(page);
    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${BEFORE}/`);
      await page.waitForTimeout(500);
      await page.locator('header').screenshot({ path: `${OUT}/05-header-${width}-BEFORE.png`, scale: 'device' });
      await page.goto('/');
      await page.waitForTimeout(500);
      await page.locator('header').screenshot({ path: `${OUT}/06-header-${width}-AFTER.png`, scale: 'device' });
    }
  });

  test('language picker', async ({ page }) => {
    await muteApi(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Change language' }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/07-picker-desktop.png`, clip: { x: 800, y: 0, width: 480, height: 440 } });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Change language' }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/08-picker-mobile.png` });
  });

  test('japanese', async ({ page }) => {
    await muteApi(page);
    await page.goto('/?lang=ja');
    await openTypeFilter(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/13-japanese.png`, clip: { x: 640, y: 60, width: 640, height: 620 } });
  });

  test('feedback', async ({ page }) => {
    await muteApi(page);
    await page.goto('/');
    await page.waitForTimeout(500);
    // Scroll the page so the floating button and some page content are both in
    // frame; a bottom-anchored element is otherwise flush with the viewport edge.
    const fab = page.getByRole('button', { name: 'Report a problem' }).first();
    await page.screenshot({ path: `${OUT}/09-feedback-button.png`, clip: { x: 880, y: 620, width: 400, height: 280 } });

    await fab.click();
    await page.waitForTimeout(400);
    await page.getByText('What gets sent').click();
    await page.waitForTimeout(400);
    // The card, not a guessed rectangle: the root font-size is JS-computed, so
    // `w-80` is not 320px at every viewport.
    await page.getByRole('dialog').screenshot({ path: `${OUT}/10-feedback-form.png` });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Report a problem' }).first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/11-feedback-mobile.png` });
  });

  test('footer', async ({ page }) => {
    await muteApi(page);
    await page.goto('/');
    const footer = page.getByRole('button', { name: 'Report a problem' }).last();
    await footer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const box = (await footer.boundingBox())!;
    await page.screenshot({
      path: `${OUT}/12-footer.png`,
      clip: { x: Math.max(0, box.x - 240), y: Math.max(0, box.y - 120), width: 520, height: 190 },
    });
  });
});
