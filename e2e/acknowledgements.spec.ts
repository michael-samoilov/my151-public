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
    for (const group of ['Sprites', 'Icons and art', 'Fonts', 'Data', 'Code']) {
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
    expect(licenseRequests, 'no license text loads before an entry opens').toEqual([]);

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

    // A sprite source lists the Pokémon it drew, by generation.
    await dialog.locator('[data-ack-id="kyle-dove"]').click();
    const sprites = dialog.getByTestId('ack-sprites');
    await expect(sprites.getByRole('heading', { name: /^Sprites on my151 \d+$/ })).toBeVisible();
    await sprites.getByText('Generation 1', { exact: true }).click();
    await expect(sprites.getByRole('listitem').first()).toBeVisible();
    const kyleDoveSprites = Number(/(\d+)$/.exec((await sprites.getByRole('heading').textContent())!.trim())?.[1]);
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
        licenseChars,
        rows,
        kyleDoveSprites,
      }, null, 2),
    });
  });
});
