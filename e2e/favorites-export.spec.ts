import { test, expect } from '@playwright/test';

test.describe('full favorite chart export', () => {
  test('partial chart uses shared PNG geometry and preserves saved settings', { tag: '@ci-smoke' }, async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      localStorage.setItem('favorite-picker', JSON.stringify({ state: { fills: { 'fire|1': 4, 'grass|1': 1 } }, version: 3 }));
      localStorage.setItem('personal-151-favorites-show-icons-v1', '0');
    });
    await page.goto('/favorite-pokemon-picker?lang=en');
    const before = await page.evaluate(() => [localStorage.getItem('favorite-picker'), localStorage.getItem('personal-151-favorites-show-icons-v1')]);
    await page.getByTestId('favorites-export-open').click();
    const save = page.getByTestId('favorites-export-save');
    await expect(save).toBeEnabled({ timeout: 30000 });
    const image = page.locator('[data-export-preview-layer] img[src^="blob:"]');
    await expect(image).toBeVisible();
    const geometry = await image.evaluate(async el => {
      const img = el as HTMLImageElement;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0);
      const pixel = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data];
      const sprite = new Image(); sprite.src = '/sprites/pokemon/4.png'; await sprite.decode();
      const native = document.createElement('canvas'); native.width = 96; native.height = 96;
      const source = native.getContext('2d')!; source.imageSmoothingEnabled = false; source.drawImage(sprite, 0, 0, 96, 96);
      const pixels = source.getImageData(0, 0, 96, 96).data;
      let opaque = 0, matching = 0;
      for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
        const i = (y * 96 + x) * 4;
        if (pixels[i + 3] !== 255) continue;
        opaque++;
        if (pixel(288 + x, 248 + y).every((value, channel) => value === pixels[i + channel])) matching++;
      }
      return { width: img.naturalWidth, height: img.naturalHeight, corner: pixel(0, 0), frame: pixel(1400, 4), white: pixel(1400, 104), header: pixel(1400, 20), opaque, matching };
    });
    expect(geometry).toMatchObject({ width: 2832, height: 1724, corner: [0, 0, 0, 0], frame: [220, 38, 38, 255], white: [255, 255, 255, 255], header: [220, 38, 38, 255] });
    expect(geometry.opaque).toBeGreaterThan(100);
    expect(geometry.matching).toBe(geometry.opaque);
    await testInfo.attach('png-geometry', { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' });
    await expect(page.locator('[data-favorites-export-mode=full]')).toHaveAttribute('aria-pressed', 'true');
    const downloadPromise = page.waitForEvent('download');
    await save.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('my151-favorites.png');
    expect(await download.failure()).toBeNull();
    await expect(page.locator('[data-export-preview-layer]')).toHaveCount(0);
    expect(await page.evaluate(() => [localStorage.getItem('favorite-picker'), localStorage.getItem('personal-151-favorites-show-icons-v1')])).toEqual(before);
  });

  test('empty and stale charts export, and Escape returns to the unchanged grid', async ({ page }, testInfo) => {
    await page.addInitScript(() => localStorage.setItem('favorite-picker', JSON.stringify({ state: { fills: { 'fire|1': 7, 'favorite|favorite': 999999 } }, version: 3 })));
    await page.goto('/favorite-pokemon-picker?lang=en');
    await page.getByTestId('favorites-export-open').click();
    await expect(page.getByTestId('favorites-export-save')).toBeEnabled({ timeout: 30000 });
    await expect(page.locator('[data-export-preview-layer] img[src^="blob:"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-export-preview-layer]')).toHaveCount(0);
    await expect(page.getByTestId('favorites-grid')).toBeVisible();
    await testInfo.attach('unchanged-grid', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('Japanese export chrome and preview use the active locale', async ({ page }, testInfo) => {
    await page.goto('/favorite-pokemon-picker?lang=ja');
    await page.getByTestId('favorites-export-open').click();
    await expect(page.getByTestId('favorites-export-save')).toBeEnabled({ timeout: 30000 });
    await expect(page.getByTestId('favorites-export-save')).not.toContainText('Save image');
    await expect(page.getByTestId('favorites-export-settings')).not.toContainText('Full chart');
    await expect(page.locator('[data-export-preview-layer] img')).not.toHaveAttribute('alt', 'Favorite Pokémon chart preview');
    await testInfo.attach('localized-preview', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('a failed sprite load retries without changing saved picks', async ({ page }, testInfo) => {
    await page.addInitScript(() => localStorage.setItem('favorite-picker', JSON.stringify({ state: { fills: { 'fire|1': 4 } }, version: 3 })));
    // Intercept before navigation: the grid loads this sprite too, so a later
    // route can miss the export request when the decoded image is cached.
    await page.route('**/sprites/pokemon/4.png', route => route.abort());
    await page.goto('/favorite-pokemon-picker?lang=en');
    const before = await page.evaluate(() => localStorage.getItem('favorite-picker'));
    await page.getByTestId('favorites-export-open').click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByTestId('favorites-export-save')).toBeDisabled();
    await page.unroute('**/sprites/pokemon/4.png');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('favorites-export-save')).toBeEnabled({ timeout: 30000 });
    expect(await page.evaluate(() => localStorage.getItem('favorite-picker'))).toBe(before);
    await testInfo.attach('recovered-preview', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('a cancelled native share keeps the preview and saved picks', async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15', configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
      Object.defineProperty(navigator, 'share', { value: () => Promise.reject(new DOMException('Cancelled', 'AbortError')), configurable: true });
    });
    await page.goto('/favorite-pokemon-picker?lang=en');
    await page.getByTestId('favorites-export-open').click();
    await expect(page.getByTestId('favorites-export-save')).toBeEnabled({ timeout: 30000 });
    const before = await page.evaluate(() => localStorage.getItem('favorite-picker'));
    await page.getByTestId('favorites-export-save').click();
    await expect(page.getByTestId('favorites-export-save')).toBeEnabled();
    await expect(page.locator('[data-export-preview-layer] img')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('favorite-picker'))).toBe(before);
    await testInfo.attach('cancelled-share-preview', { body: await page.screenshot(), contentType: 'image/png' });
  });


  test('export dialog fits the viewport and contains keyboard focus @viewport', { tag: '@ci-smoke' }, async ({ page }, testInfo) => {
    await page.goto('/favorite-pokemon-picker?lang=de');
    await page.getByTestId('favorites-export-open').click();
    await expect(page.getByTestId('favorites-export-save')).toBeEnabled({ timeout: 30000 });
    const dialog = page.locator('[role="dialog"][data-export-chrome]');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    const bounds = await dialog.boundingBox();
    const viewport = page.viewportSize()!;
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
    for (let index = 0; index < 6; index++) {
      await page.keyboard.press(index % 2 ? 'Shift+Tab' : 'Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('favorites-export-open')).toBeFocused();
    await testInfo.attach('dialog-fit', { body: JSON.stringify({ bounds, viewport }, null, 2), contentType: 'application/json' });
  });

});
