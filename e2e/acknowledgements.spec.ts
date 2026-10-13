import { expect, test } from '@playwright/test';

/**
 * The footer's Acknowledgements panel: a bottom sheet on a phone and a
 * right-hand pane on desktop, with a list of credits and a detail level that
 * loads the license text only when an entry opens.
 */
test.describe('acknowledgements', { tag: '@viewport' }, () => {
  test('opens from the hub footer, shows a license, goes back, and closes', async ({ page }, testInfo) => {
    await page.route('**/api/event', (route) => route.fulfill({ status: 200, body: '{}' }));
    const licenseRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/licenses/')) licenseRequests.push(request.url());
    });

    await page.goto('/');
    const link = page.getByRole('button', { name: 'Acknowledgements' }).last();
    await link.scrollIntoViewIfNeeded();
    await link.click();

    const dialog = page.getByRole('dialog', { name: 'Acknowledgements' });
    await expect(dialog).toBeVisible();
    for (const group of ['Sprite sources', 'Sprite artists', 'Pokémon icons and art', 'Interface icons', 'Fonts', 'Data', 'Code']) {
      await expect(dialog.getByRole('heading', { name: new RegExp(`^${group}`) })).toBeVisible();
    }
    // The count matches the rows: a sprite source with no sprite in this build has no row.
    const rows = await dialog.locator('[data-ack-id]').count();
    await expect(dialog.getByText(`${rows} credits`)).toBeVisible();

    // The container differs by width: a sheet along the bottom on a phone, a
    // full-height pane along the right on desktop.
    const viewport = page.viewportSize()!;
    const box = (await dialog.boundingBox())!;
    const desktop = viewport.width >= 1024;
    if (desktop) {
      expect(Math.round(box.x + box.width)).toBe(viewport.width);
      expect(Math.round(box.height)).toBe(viewport.height);
    } else {
      expect(Math.round(box.width)).toBe(viewport.width);
      expect(Math.round(box.y + box.height)).toBe(viewport.height);
    }
    const licenseTexts = () => licenseRequests.filter((url) => url.endsWith('.txt'));
    expect(licenseTexts(), 'no license text loads before an entry opens').toEqual([]);

    const row = dialog.locator('[data-ack-id="pokeapi"]');
    await row.click();
    await expect(dialog.getByTestId('ack-detail-name')).toHaveText('PokéAPI');
    const license = dialog.getByTestId('ack-license-text');
    await expect(license).toContainText('Redistribution and use in source and binary forms');
    await expect(dialog.getByRole('button', { name: 'Back' })).toBeFocused();
    const licenseChars = (await license.textContent())!.length;

    await dialog.getByRole('button', { name: 'Back' }).click();
    await expect(dialog.getByTestId('ack-detail')).toHaveAttribute('inert', '');
    await expect(row).toBeFocused();

    // Sprites are credited through their bundles: a bundle says how many of
    // the app's sprites came through it, quotes its own permission once and
    // links its pages, and lists no sprites.
    await dialog.locator('[data-ack-id="pokeapi-sprites"]').click();
    await expect(dialog.getByTestId('ack-project-count')).toHaveText(/^my151 shows [\d,]+ sprites from it\.$/);
    await expect(dialog.getByTestId('ack-terms').locator('blockquote')).toHaveCount(1);
    await expect(dialog.getByTestId('ack-sprites')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Back' }).click();
    await expect(dialog.getByTestId('ack-detail')).toHaveAttribute('inert', '');

    // Only an artist whose sprites the app took from them directly has an
    // entry: KingOfThe-X-Roads, for his own uploads.
    const artists = dialog.getByTestId('ack-group-sprite-artists').locator('[data-ack-id]');
    await expect(artists).toHaveCount(1);
    await artists.first().click();
    await expect(dialog.getByTestId('ack-detail-name')).toHaveText('KingOfThe-X-Roads');
    const sprites = dialog.getByTestId('ack-sprites');
    await expect(sprites.getByTestId('ack-sprites-summary')).toHaveText(/^\d+ sprites from their own uploads$/);
    await expect(sprites.getByRole('listitem').filter({ hasText: 'Rotom' })).toHaveText('Rotom (DJ)');
    const kingSprites = await sprites.getByRole('listitem').count();
    await dialog.getByRole('button', { name: 'Back' }).click();
    await expect(dialog.getByTestId('ack-detail')).toHaveAttribute('inert', '');

    // The npm packages come from the build's own list, by license, and each
    // license file is named for what it holds.
    await dialog.locator('[data-ack-id="npm-packages"]').click();
    const packages = dialog.getByTestId('ack-packages');
    await expect(packages.getByRole('listitem').filter({ hasText: /^react \d/ })).toBeVisible();
    const packageCount = await packages.getByRole('listitem').count();
    await expect(dialog.getByTestId('ack-package-files').getByRole('link')).toHaveText([
      /^License texts of \d+ packagesnpm-packages\.txt$/,
      /^License texts of 4 packagestailwindcss, modern-normalize, country-flag-icons, and echarts NOTICE$/,
    ]);
    await dialog.getByRole('button', { name: 'Back' }).click();
    await expect(dialog.getByTestId('ack-detail')).toHaveAttribute('inert', '');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(link).toBeFocused();

    // A press outside the panel closes it too.
    await link.click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(8, 8);
    await expect(dialog).toBeHidden();

    await testInfo.attach('acknowledgements.json', {
      contentType: 'application/json',
      body: JSON.stringify({
        container: desktop ? 'side pane' : 'bottom sheet',
        licenseRequests: licenseRequests.map((url) => new URL(url).pathname),
        packageCount,
        licenseChars,
        rows,
        kingSprites,
      }, null, 2),
    });
  });
});
