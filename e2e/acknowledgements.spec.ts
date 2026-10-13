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
    for (const group of ['Sprite projects', 'Sprite artists', 'Pokémon icons and art', 'Interface icons', 'Fonts', 'Data', 'Code']) {
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

    // An artist's entry lists every sprite of theirs the app shows, folded
    // by generation, each with the people its row also credits: Kyle Dove
    // asks to credit MyMarshlands for Victreebel.
    await dialog.locator('[data-ack-id="artist:Kyle Dove"]').click();
    const sprites = dialog.getByTestId('ack-sprites');
    await expect(sprites.getByTestId('ack-sprites-summary')).toHaveText(/^\d+ sprites via PokéAPI sprites/);
    await sprites.getByText('Generation 1', { exact: true }).click();
    await expect(sprites.getByRole('listitem').filter({ hasText: 'Mega Victreebel' })).toHaveText('Mega Victreebel · with MyMarshlands');
    const kyleDoveSprites = Number(/^(\d+)/.exec((await sprites.getByTestId('ack-sprites-summary').textContent())!)?.[1]);

    // Its "via" opens the project's entry in the panel, which links back to
    // the artist; Back retraces both steps.
    await sprites.getByRole('button', { name: 'PokéAPI sprites' }).click();
    await expect(dialog.getByTestId('ack-detail-name')).toHaveText('PokéAPI sprites');
    await dialog.getByTestId('ack-project-artists').locator('[data-ack-id="artist:Kyle Dove"]').click();
    await expect(dialog.getByTestId('ack-detail-name')).toHaveText('Kyle Dove');
    await dialog.getByRole('button', { name: 'Back' }).click();
    await expect(dialog.getByTestId('ack-detail-name')).toHaveText('PokéAPI sprites');
    await dialog.getByRole('button', { name: 'Back' }).click();
    await expect(dialog.getByTestId('ack-detail-name')).toHaveText('Kyle Dove');
    await dialog.getByRole('button', { name: 'Back' }).click();
    await expect(dialog.getByTestId('ack-detail')).toHaveAttribute('inert', '');

    // MyMarshlands states no terms; the entry quotes Kyle Dove's post, which
    // asks to credit MyMarshlands. A renamed artist names the old spelling.
    await dialog.locator('[data-ack-id="artist:MyMarshlands"]').click();
    await expect(dialog.getByTestId('ack-terms')).toContainText('please credit my friend MyMarshlands');
    await dialog.getByRole('button', { name: 'Back' }).click();
    await dialog.locator('[data-ack-id="artist:Falgaia"]').click();
    await expect(dialog.getByTestId('ack-credited-as')).toHaveText('Credited as aXl');
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
        kyleDoveSprites,
      }, null, 2),
    });
  });
});
