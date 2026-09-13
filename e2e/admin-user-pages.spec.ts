import { expect, test } from '@playwright/test';

/**
 * Admin user-detail pages, driven through `/?admin&demo` so the production
 * bundle is the thing under test and no live token is required.
 *
 * League must fit the viewport (no page scroll). The demo's first league
 * user carries a count-only drop-then-restore phantom; tidy must hide it
 * so the scrubber has 3 sessions, not 4. Dex may scroll inside its pane.
 * The Dex / League toggle is always present; a tool the browser never
 * used is greyed.
 */

async function openDemo(page: import('@playwright/test').Page) {
  await page.goto('/?admin&demo');
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

function userTools(page: import('@playwright/test').Page) {
  return page.getByRole('group', { name: "This browser's tools" });
}

test.describe('admin user pages', () => {
  test('league visits fit the viewport and hide a count-only phantom dip', async ({ page }, info) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'League' }).click();
    await page.getByRole('button', { name: 'Visits' }).first().click();
    await expect(page.getByRole('button', { name: '‹ Back' })).toBeVisible();

    const scrub = page.getByRole('slider', { name: 'Scrub sessions' });
    await expect(scrub).toBeVisible();
    await expect(scrub).toHaveAttribute('max', '2');

    await scrub.fill('0');
    const first = await scrub.getAttribute('aria-valuetext');
    await scrub.fill('2');
    const last = await scrub.getAttribute('aria-valuetext');
    expect(first).toBeTruthy();
    expect(last).toBeTruthy();
    expect(first).not.toEqual(last);

    if (info.project.name !== 'desktop') {
      const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        return { scrollH: de.scrollHeight, innerH: window.innerHeight };
      });
      expect(overflow.scrollH).toBeLessThanOrEqual(overflow.innerH + 2);

      const box = await scrub.boundingBox();
      const vh = page.viewportSize()?.height ?? 0;
      expect(box).toBeTruthy();
      expect(box!.y).toBeGreaterThan(vh * 0.55);
    }
  });

  test('dex builds shows a timeline and a snapshot', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'Dex' }).click();
    await page.getByRole('button', { name: 'Builds' }).first().click();
    await expect(page.getByRole('button', { name: '‹ Back' })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Scrub sessions' })).toBeVisible();
    await expect(page.getByText(/of 151/)).toBeVisible();
    await expect(userTools(page).getByRole('button', { name: 'Dex' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('a user page toggles between dex and league', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'League' }).click();
    await page.getByRole('button', { name: 'Visits' }).first().click();
    const tools = userTools(page);
    await expect(tools.getByRole('button', { name: 'League' })).toHaveAttribute('aria-pressed', 'true');
    await expect(tools.getByRole('button', { name: 'Dex' })).toBeEnabled();
    await tools.getByRole('button', { name: 'Dex' }).click();
    await expect(page.getByText(/of 151/)).toBeVisible();
    await expect(tools.getByRole('button', { name: 'Dex' })).toHaveAttribute('aria-pressed', 'true');
    await tools.getByRole('button', { name: 'League' }).click();
    await expect(page.getByRole('slider', { name: 'Scrub sessions' })).toHaveAttribute('max', '2');
  });

  test('an unused tool stays visible and is not pressable', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'League' }).click();
    await page.getByRole('button', { name: 'Visits' }).last().click();
    const tools = userTools(page);
    await expect(tools.getByRole('button', { name: 'League' })).toBeEnabled();
    await expect(tools.getByRole('button', { name: 'Dex' })).toBeDisabled();
  });
});
