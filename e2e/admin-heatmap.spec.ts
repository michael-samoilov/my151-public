import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The admin When card, in demo mode so CI needs no token. Wide screens put
 * hours across and narrow ones put hours down, and at every width each label
 * and total fits its box and a tapped cell's readout stays inside the card.
 */
function whenCard(page: Page) {
  return page.locator('section', { has: page.getByRole('heading', { name: /^When/ }) });
}

function shownGrid(card: Locator) {
  return card.getByTestId('heatmap-grid').filter({ visible: true });
}

test.describe('admin When heatmap', { tag: '@viewport' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?admin&demo');
    await expect(whenCard(page)).toBeVisible();
  });

  test('lays out by width and fits every label', async ({ page }) => {
    const card = whenCard(page);
    const grid = shownGrid(card);
    const wide = (page.viewportSize()?.width ?? 0) >= 1024;
    await expect(grid).toHaveAttribute('data-layout', wide ? 'landscape' : 'portrait');
    await expect(grid.getByTestId('heatmap-cell')).toHaveCount(7 * 24);

    const overflowing = await grid.evaluate((el) =>
      [...el.querySelectorAll<HTMLElement>('div')]
        .filter((d) => d.childElementCount === 0 && d.textContent)
        .filter((d) => {
          const range = document.createRange();
          range.selectNodeContents(d);
          const t = range.getBoundingClientRect();
          const b = d.getBoundingClientRect();
          return t.left < b.left - 0.5 || t.right > b.right + 0.5;
        })
        .map((d) => d.textContent),
    );
    expect(overflowing, 'labels wider than their box').toEqual([]);
    const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(pageOverflow).toBe(0);
  });

  test('switches clocks and reads out a tapped cell inside the card', async ({ page }, testInfo) => {
    const touch = !!testInfo.project.use.hasTouch;
    const press = (l: Locator) => (touch ? l.tap() : l.click());
    const card = whenCard(page);
    const clocks = card.getByRole('group', { name: 'Clock' });
    await expect(clocks.getByRole('button', { name: 'Local time' })).toHaveAttribute('aria-pressed', 'true');
    await expect(card.getByRole('img', { name: /^Local time: \d+ browsers/ })).toBeVisible();

    const cells = shownGrid(card).getByTestId('heatmap-cell');
    for (const [cell, slot] of [[cells.first(), 'Sun 12 AM'], [cells.last(), 'Sat 11 PM']] as const) {
      await press(cell);
      const tip = card.getByRole('tooltip');
      await expect(tip).toHaveText(new RegExp(`^${slot} · \\d+$`));
      const inside = await tip.evaluate((el) => {
        const t = el.getBoundingClientRect();
        const c = el.closest('section')!.getBoundingClientRect();
        return t.left >= c.left && t.right <= c.right;
      });
      expect(inside, `${slot} readout inside the card`).toBe(true);
    }
    const localTip = await card.getByRole('tooltip').textContent();

    await press(clocks.getByRole('button', { name: 'Eastern Time' }));
    await expect(clocks.getByRole('button', { name: 'Eastern Time' })).toHaveAttribute('aria-pressed', 'true');
    await expect(card.getByRole('img', { name: /^Eastern Time: \d+ browsers/ })).toBeVisible();
    // A mouse leaving the grid clears the hover readout; a tap keeps it.
    if (!touch) await cells.last().click();
    await expect(card.getByRole('tooltip')).toHaveText(/^Sat 11 PM · \d+$/);
    await expect(card.getByRole('tooltip')).not.toHaveText(localTip ?? '');
  });
});
