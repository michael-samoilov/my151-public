import { expect, test } from '@playwright/test';

/**
 * Admin user-detail pages, driven through `/?admin&demo` so the production
 * bundle is the thing under test and no live token is required.
 *
 * League must fit the viewport (no page scroll). The demo's first league
 * user carries a count-only drop-then-restore phantom; tidy must hide it
 * so the scrubber has 3 sessions, not 4. Dex may scroll — the 151 grid is
 * allowed to — but the timeline and a build snapshot have to render.
 */

async function openDemo(page: import('@playwright/test').Page) {
  await page.goto('/?admin&demo');
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
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
    }
  });

  test('dex builds shows a timeline and a snapshot', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'Dex' }).click();
    await page.getByRole('button', { name: 'Builds' }).first().click();
    await expect(page.getByRole('button', { name: '‹ Back' })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Scrub sessions' })).toBeVisible();
    await expect(page.getByText(/of 151/)).toBeVisible();
  });
});
