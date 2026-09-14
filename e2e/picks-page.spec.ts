import { expect, test, type Page } from '@playwright/test';

/**
 * The admin "What people pick" page. Demo fixture, no token.
 *
 * Layout: builder chrome with the section name at the top-left; most/least
 * as 6-col sprite grids with an index bar under each sprite. Off-section has
 * no least column, no row cap, and shows dex counts. In-section Starters
 * list every first-stage face across the full row, split by grass / fire /
 * water, with no most/least. Off-section Starters do not.
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

    await expect(starters.getByText('Most', { exact: true })).toHaveCount(0);
    await expect(starters.getByText('Least', { exact: true })).toHaveCount(0);
    const expectedCols = test.info().project.name === 'desktop' ? 12 : 6;
    await expect(starters.locator('[data-picks-side="most"]').first()).toHaveAttribute(
      'data-picks-cols',
      String(expectedCols),
    );

    await expect.poll(async () =>
      starters.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
  });

  test('off-section tab keeps chrome, omits least, and shows counts', async ({ page }) => {
    await openPicks(page);
    await page.getByRole('button', { name: 'Off-section' }).click();
    const evil = page.locator('[data-section-id="evil-team"]');
    await expect(evil).toBeVisible();
    await expect(evil.getByText('Evil Team', { exact: true })).toBeVisible();
    await expect(evil.locator('[data-index-meter]').first()).toBeVisible();
    await expect(evil.locator('[data-picks-side="least"]')).toHaveCount(0);
    await expect(evil.getByText('Least', { exact: true })).toHaveCount(0);
    const shown = await evil.locator('[data-index-meter]').first().getAttribute('data-index-meter');
    expect(shown).toBeTruthy();
    expect(shown).not.toMatch(/×$/);

    const starters = page.locator('[data-section-id="starter"]');
    await expect(starters).toBeVisible();
    await expect(starters.locator('[data-type="grass"]')).toHaveCount(0);
    await expect(starters.locator('[data-type="fire"]')).toHaveCount(0);
    await expect(starters.locator('[data-type="water"]')).toHaveCount(0);
    const faceIds = await starters.locator('[data-face-id]').evaluateAll((els) =>
      els.map((el) => Number(el.getAttribute('data-face-id'))),
    );
    expect(faceIds).toContain(172);
    expect(faceIds).toContain(25);

    const expectedCols = test.info().project.name === 'desktop' ? 12 : 6;
    await expect(starters.locator('[data-picks-side="most"]')).toHaveAttribute(
      'data-picks-cols',
      String(expectedCols),
    );
    const gridCols = await starters.locator('[data-picks-side="most"] .grid').first().evaluate((el) =>
      getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length,
    );
    expect(gridCols).toBe(expectedCols);
  });

  test('off-section includes one-offs until Exclude one-offs is on', async ({ page }) => {
    await openPicks(page);
    await page.getByRole('button', { name: 'Off-section' }).click();
    const chip = page.getByRole('button', { name: 'Exclude one-offs' });
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    const evil = page.locator('[data-section-id="evil-team"]');
    await expect(evil.locator('[data-face-id="4"]')).toHaveCount(1);
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(evil.locator('[data-face-id="4"]')).toHaveCount(0);
    await expect(evil.locator('[data-face-id="129"]')).toHaveCount(1);
  });
});
