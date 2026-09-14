import { expect, test } from '@playwright/test';
import { seededLeague } from './support/leagueSeed';

/**
 * The mobile export sheet must not cover the live preview. Settings stay in
 * a capped, scrollable band; the card keeps the rest of the screen.
 */
test.describe('mobile export sheet', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('leaves a preview band above the settings sheet', async ({ page }) => {
    await seededLeague(page);
    await page.goto('/custom-gym-leader');
    await page.locator('[data-testid="league-slot-0"]').waitFor();
    await page.locator('[data-league-export]').first().click();
    await page.locator('[data-export-preview] img').waitFor({ timeout: 45_000 });

    const previewBox = await page.locator('[data-export-preview-layer]').boundingBox();
    const sheetBox = await page.locator('[data-export-chrome]').boundingBox();
    expect(previewBox, 'preview layer').toBeTruthy();
    expect(sheetBox, 'settings sheet').toBeTruthy();
    expect(sheetBox!.height).toBeLessThanOrEqual(Math.round(844 * 0.45) + 8);
    expect(previewBox!.height).toBeGreaterThan(sheetBox!.height);
    expect(previewBox!.height).toBeGreaterThan(320);

    const imgBox = await page.locator('[data-export-preview-layer] img').boundingBox();
    expect(imgBox!.height).toBeGreaterThan(280);
  });
});
