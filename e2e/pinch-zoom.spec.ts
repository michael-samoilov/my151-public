import { expect, test, type Page } from '@playwright/test';

async function pinchBlockers(page: Page) {
  return page.evaluate(() => {
    const bad: Array<{ id: string; touchAction: string; area: number }> = [];
    for (const el of document.querySelectorAll<HTMLElement>('*')) {
      if (el.closest('[data-testid="card-zoom-frame"]')) continue;
      const ta = getComputedStyle(el).touchAction;
      if (ta === 'auto' || ta === 'manipulation' || ta.includes('pinch-zoom')) continue;
      const r = el.getBoundingClientRect();
      if (r.width * r.height < 4000) continue;
      bad.push({
        id: el.getAttribute('data-testid') ?? `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`,
        touchAction: ta,
        area: Math.round(r.width * r.height),
      });
    }
    return bad.sort((a, b) => b.area - a.area);
  });
}

test.describe('pinch to zoom', { tag: '@viewport' }, () => {
  test('nothing large on the league summary swallows it', async ({ page }) => {
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.waitForTimeout(500);
    expect(await pinchBlockers(page)).toEqual([]);
  });

  test('nothing large on a gym card swallows it', async ({ page }) => {
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(600);
    expect(await page.locator('[data-testid="card-zoom-frame"]').count(), 'the card zooms itself').toBe(1);
    expect(await pinchBlockers(page)).toEqual([]);
  });

  test('nothing large on the dex builder swallows it', async ({ page }) => {
    await page.goto('/pokedex-builder');
    await page.waitForTimeout(1200);
    expect(await pinchBlockers(page)).toEqual([]);
  });
});
