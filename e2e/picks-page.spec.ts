import { expect, test, type Page } from '@playwright/test';

/**
 * The admin "What people pick" page. Demo fixture, no token.
 *
 * Layout: builder chrome with the section name at the top-left; most/least
 * as two pairs of 6-row bar columns (sprite label, horizontal index bar).
 * Off-section has no least column. Starters show first-stage faces only.
 */

async function openPicks(page: Page) {
  await page.route('**/api/event', (route) => route.fulfill({ status: 200, body: '{}' }));
  await page.goto('/?admin&demo');
  await expect(page.getByRole('heading', { name: /Analytics/ })).toBeVisible();
  await page.getByRole('button', { name: /Most picked/ }).click();
  await expect(page.getByRole('button', { name: '‹ Back' })).toBeVisible();
}

test.describe('admin picks page', () => {
  test('wraps sections in builder chrome and shows index bars', async ({ page }) => {
    await openPicks(page);

    const starters = page.locator('[data-section-id="starter"]');
    await expect(starters).toBeVisible();
    await expect(starters.getByText('Starters', { exact: true })).toBeVisible();
    await expect(starters.locator('[data-type="grass"]')).toBeVisible();
    await expect(starters.locator('[data-type="fire"]')).toBeVisible();
    await expect(starters.locator('[data-type="water"]')).toBeVisible();

    const meter = starters.locator('[data-index-meter]').first();
    await expect(meter).toBeVisible();
    const width = await meter.locator('[data-index-fill]').evaluate((el) => (el as HTMLElement).style.width);
    expect(width.endsWith('%')).toBe(true);
    expect(Number.parseFloat(width)).toBeGreaterThan(0);

    const box = await starters.evaluate((el) => {
      const s = getComputedStyle(el);
      return { radius: s.borderRadius, labelAlign: getComputedStyle(el.firstElementChild as HTMLElement).textAlign };
    });
    expect(Number.parseFloat(box.radius)).toBeGreaterThan(0);
    expect(box.labelAlign).toBe('left');

    const faceIds = await starters.locator('[data-face-id]').evaluateAll((els) =>
      els.map((el) => Number(el.getAttribute('data-face-id'))),
    );
    expect(faceIds).toContain(1);
    expect(faceIds).not.toContain(2);
    expect(faceIds).not.toContain(3);
    expect(faceIds).not.toContain(6);

    await expect.poll(async () =>
      starters.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
  });

  test('off-section tab keeps chrome and omits least-picked', async ({ page }) => {
    await openPicks(page);
    await page.getByRole('button', { name: 'Off-section' }).click();
    const evil = page.locator('[data-section-id="evil-team"]');
    await expect(evil).toBeVisible();
    await expect(evil.getByText('Evil Team', { exact: true })).toBeVisible();
    await expect(evil.locator('[data-index-meter]').first()).toBeVisible();
    await expect(evil.locator('[data-picks-side="least"]')).toHaveCount(0);
    await expect(evil.getByText('Least', { exact: true })).toHaveCount(0);
  });

  test('least-picked bottom-aligns the lowest index in the second bar column', async ({ page }) => {
    await openPicks(page);
    const least = page.locator('[data-picks-side="least"]').first();
    await expect(least).toBeVisible();
    const cols = least.locator('[data-bar-col]');
    const colCount = await cols.count();
    if (colCount < 2) {
      test.info().annotations.push({ type: 'skip-reason', description: 'demo least fits in one column' });
      return;
    }
    const leftLast = cols.nth(0).locator('[data-index-meter]').last();
    const rightLast = cols.nth(1).locator('[data-index-meter]').last();
    const left = await leftLast.boundingBox();
    const right = await rightLast.boundingBox();
    expect(left).toBeTruthy();
    expect(right).toBeTruthy();
    expect(Math.abs((left!.y + left!.height) - (right!.y + right!.height))).toBeLessThan(6);
  });
});
