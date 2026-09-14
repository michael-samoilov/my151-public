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

      const gap = await page.evaluate(() => {
        const dock = document.querySelector('[data-testid="session-scrubber-dock"]')?.getBoundingClientRect();
        const nav = document.querySelector('nav[aria-label="Admin section"]')?.getBoundingClientRect();
        if (!dock || !nav) return 999;
        return nav.top - dock.bottom;
      });
      expect(gap).toBeGreaterThanOrEqual(-2);
      expect(gap).toBeLessThan(6);

      const gym = await page.getByTestId('admin-slot-0').boundingBox();
      const champ = await page.getByTestId('admin-slot-12').boundingBox();
      const boss = await page.getByTestId('admin-slot-13').boundingBox();
      const navBox = await page.getByRole('navigation', { name: 'Admin section' }).boundingBox();
      expect(gym && champ && boss && navBox).toBeTruthy();
      expect(champ!.y + champ!.height).toBeLessThanOrEqual(navBox!.y + 2);
      expect(boss!.y + boss!.height).toBeLessThanOrEqual(navBox!.y + 2);
      expect(champ!.width).toBeGreaterThan(gym!.width * 1.2);
      expect(Math.abs(champ!.width - boss!.width)).toBeLessThan(4);
    } else {
      const board = page.getByTestId('league-visit-board');
      await expect(board).toBeVisible();
      await expect(board).toHaveAttribute('data-cols', /^(7|14)$/);
      await expect(page.getByTestId('admin-gym-card')).toHaveCount(14);
      const first = page.getByTestId('admin-gym-card').first();
      const late = first.locator('[data-row="10"], [data-row="11"]');
      await expect(late.first()).toBeVisible();
      await expect(first.getByTestId('admin-gym-stage-row')).toBeVisible();
      await expect(first.getByTestId('admin-gym-stage-badge')).toBeVisible();
      const row1 = await first.locator('[data-row="1"]').first().boundingBox();
      const cardBox = await first.boundingBox();
      expect(row1 && cardBox).toBeTruthy();
      expect(row1!.x).toBeGreaterThan(cardBox!.x + cardBox!.width * 0.4);
      const rail = await page.getByRole('slider', { name: 'Scrub sessions' }).boundingBox();
      const tabW = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Admin section"]');
        const buttons = [...(nav?.querySelectorAll('button') ?? [])];
        if (buttons.length === 0) return 0;
        const a = buttons[0].getBoundingClientRect();
        const b = buttons[buttons.length - 1].getBoundingClientRect();
        return b.right - a.left;
      });
      expect(rail).toBeTruthy();
      expect(Math.abs(rail!.width - tabW)).toBeLessThan(80);
      const chips = page.getByTestId('admin-rail-chip');
      await expect(chips).toHaveCount(2);
      const leftChip = await chips.nth(0).boundingBox();
      const rightChip = await chips.nth(1).boundingBox();
      expect(leftChip && rightChip && rail).toBeTruthy();
      expect(Math.abs(leftChip!.width - rightChip!.width)).toBeLessThan(2);
      expect(rail!.x - (leftChip!.x + leftChip!.width)).toBeGreaterThan(4);
      expect(rail!.x - (leftChip!.x + leftChip!.width)).toBeLessThan(20);
      expect(rightChip!.x - (rail!.x + rail!.width)).toBeGreaterThan(4);
      expect(rightChip!.x - (rail!.x + rail!.width)).toBeLessThan(20);
      const thumb = await page.evaluate(() => {
        const input = document.querySelector('input[aria-label="Scrub sessions"]') as HTMLInputElement | null;
        const dots = [...document.querySelectorAll('[data-testid="admin-scrub-dot"]')];
        if (!input || dots.length === 0) return null;
        const r = input.getBoundingClientRect();
        const min = Number(input.min);
        const max = Number(input.max);
        const val = Number(input.value);
        const thumbPx = 22;
        const cx = r.x + thumbPx / 2 + ((val - min) / Math.max(1, max - min)) * (r.width - thumbPx);
        const last = dots[dots.length - 1].getBoundingClientRect();
        return { cx, last: last.x + last.width / 2 };
      });
      expect(thumb).toBeTruthy();
      expect(Math.abs(thumb!.cx - thumb!.last)).toBeLessThan(3);
      const last = await page.getByTestId('admin-gym-card').nth(13).boundingBox();
      const vh = page.viewportSize()?.height ?? 0;
      expect(last).toBeTruthy();
      expect(last!.y + last!.height).toBeLessThanOrEqual(vh);
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
