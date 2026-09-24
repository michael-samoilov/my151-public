import { expect, test } from '@playwright/test';

test.describe('the selected league row', () => {
  test('uses the no-type tint while its type is still unset', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the connector is a desktop surface');

    await page.addInitScript(() => {
      const empty = {
        type: null as string | null,
        theme: '',
        lines: [] as unknown[],
        signatureSeat: null as number | null,
        tmMoveId: null as number | null,
        badgeName: '',
        legend: null,
        powerup: null,
      };
      const cards = Array.from({ length: 14 }, () => ({ ...empty, lines: [] }));
      cards[0] = { ...empty, type: 'none' };
      cards[3] = { ...empty, type: 'fire' };
      window.localStorage.setItem(
        'league-builder',
        JSON.stringify({ state: { name: '', cards }, version: 2 }),
      );
    });

    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-1"]');

    const rowColour = (index: number) => page.locator(`[data-testid="league-slot-${index}"] > .grid`)
      .evaluate((row) => getComputedStyle(row).backgroundColor);
    const explicitNoType = await rowColour(0);
    const typed = await rowColour(3);
    expect(await rowColour(1), 'an inactive unset row starts white').toBe('rgb(255, 255, 255)');

    await page.click('[data-testid="league-slot-1"]');
    await page.waitForSelector('[data-lg-card-root]');

    expect(await rowColour(1), 'the active unset row matches explicit no type').toBe(explicitNoType);
    expect(await rowColour(2), 'other unset rows stay white').toBe('rgb(255, 255, 255)');
    await expect(page.locator('svg path[fill="#9CA3AF"]')).toHaveCount(1);

    await page.click('[data-testid="league-slot-3"]');
    expect(await rowColour(3), 'selecting a typed row keeps its type tint').toBe(typed);
    expect(await rowColour(1), 'the unset row returns to white when it closes').toBe('rgb(255, 255, 255)');
  });
});
