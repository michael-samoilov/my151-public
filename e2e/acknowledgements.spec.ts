import { expect, test } from '@playwright/test';

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
    for (const group of ['Sprite projects', 'Additional sprites', 'Pokémon icons and art', 'Interface icons', 'Fonts', 'Data', 'Code']) {
      await expect(dialog.getByRole('heading', { name: new RegExp(`^${group}`) })).toBeVisible();
    }
    const rows = await dialog.locator('[data-ack-id]').count();
    await expect(dialog.getByText(`${rows} credits`)).toBeVisible();

    await expect(dialog.locator('[data-ack-id="pokemon-showdown"]')).toHaveCount(0);
    await dialog.locator('[data-ack-id="smogon-sprite-project"]').click();
    await expect(dialog.getByTestId('ack-detail').getByText('Non-profit use, with credit', { exact: true })).toBeVisible();
    await expect(dialog.locator('blockquote')).toContainText('the spriter or the project itself is credited');
    await expect(dialog.getByRole('link', { name: 'Generation 6 thread' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Back' }).click();

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

    await dialog.locator('[data-ack-id="pokeapi-sprites"]').click();
    await expect(dialog.getByTestId('ack-detail')).toContainText("The source of most of the app's sprite files.");
    await expect(dialog.getByTestId('ack-terms').locator('blockquote')).toHaveCount(1);
    await expect(dialog.getByTestId('ack-sprites')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Back' }).click();
    await expect(dialog.getByTestId('ack-detail')).toHaveAttribute('inert', '');

    const artists = dialog.getByTestId('ack-group-sprite-artists').locator('[data-ack-id]');
    await expect(artists).toHaveCount(3);
    await artists.first().click();
    await expect(dialog.getByTestId('ack-detail-name')).toHaveText('KingOfThe-X-Roads');
    const sprites = dialog.getByTestId('ack-sprites');
    await expect(sprites.getByTestId('ack-sprites-summary')).toHaveText('In addition to their sprites in the projects above, we use these 13 additional sprites from their own uploads.');
    const generations = sprites.getByTestId('ack-sprites-generation');
    await expect(generations).toHaveCount(2);
    for (const summary of await generations.locator('summary').all()) await summary.click();
    await expect(sprites.getByRole('listitem').filter({ hasText: 'Rotom' })).toHaveText('DJ Rotom');
    await expect(sprites.getByRole('listitem')).toHaveCount(13);
    const kingSprites = await sprites.getByRole('listitem').count();
    await dialog.getByRole('button', { name: 'Back' }).click();
    await expect(dialog.getByTestId('ack-detail')).toHaveAttribute('inert', '');

    for (const id of ['partywhale-type-icons', 'elginive-type-icons']) {
      await dialog.locator(`[data-ack-id="${id}"]`).click();
      await expect(dialog.getByTestId('ack-detail-name')).toHaveText('Gen 9 Type Icons');
      await dialog.getByRole('button', { name: 'Back' }).click();
    }
    await dialog.locator('[data-ack-id="bulbagarden-archives"]').click();
    await expect(dialog.getByTestId('ack-detail-name')).toHaveText('Pokémon symbols and item icons');
    await expect(dialog.getByRole('link', { name: /archives.bulbagarden.net/ })).toBeVisible();
    await dialog.getByRole('button', { name: 'Back' }).click();

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

  test('keeps the full Partywhale author credit on one line', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Acknowledgements' }).last().click();
    const dialog = page.getByRole('dialog', { name: 'Acknowledgements' });
    await expect(dialog).toBeVisible();
    const row = dialog.locator('[data-ack-id="partywhale-type-icons"]');
    await row.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    const geometry = await row.evaluate((element) => {
      const label = element.firstElementChild!.firstElementChild!;
      const author = [...label.children].find((child) => child.textContent === 'by Partywhale (James Watkins)');
      if (!author) throw new Error('Missing full Partywhale author credit');
      const range = document.createRange();
      range.selectNodeContents(author);
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
      const row = element.getBoundingClientRect();
      const chevron = element.querySelector('svg')!.getBoundingClientRect();
      return { authorLines: rects.length, authorRight: Math.max(...rects.map((rect) => rect.right)), chevronLeft: chevron.left, chevronRight: chevron.right, rowRight: row.right };
    });
    expect(geometry.authorLines).toBe(1);
    expect(geometry.authorRight).toBeLessThanOrEqual(geometry.chevronLeft);
    expect(geometry.chevronRight).toBeLessThanOrEqual(geometry.rowRight);
    await testInfo.attach('author-credit-geometry', { body: JSON.stringify(geometry), contentType: 'application/json' });
  });
});
