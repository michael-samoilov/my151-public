import { test, expect } from '@playwright/test';
import { openStatsFlow, nativeImage, toggleStats, framePixels, type StatsTool } from './support/statsFrameEvidence';
test.setTimeout(90000);
for (const tool of ['picker', 'dex'] as StatsTool[]) {
  test(`${tool} detailed export keeps both sheets aligned, framed and transparent @viewport`, async ({ page }, testInfo) => {
    await openStatsFlow(page, tool);
    const plain = await nativeImage(page, tool);
    await toggleStats(page, tool);
    const detailed = await nativeImage(page, tool);
    const measured = await framePixels(page, plain.width);
    expect(detailed.height).toBe(plain.height);
    expect(measured.corners.map(pixel => pixel[3])).toEqual([0, 0, 0, 0]);
    expect(measured.statsX).toBe(plain.width - 12);
    for (const pixel of measured.seamPixels) expect(pixel).toEqual(measured.mainTop);
    expect(measured.seamNotch[3]).toBe(0);
    expect(measured.statsTop).toEqual(measured.mainTop);
    expect(measured.statsSide).toEqual(measured.mainTop);
    expect(measured.statsBottom).toEqual(measured.mainBottom);
    expect(measured.statsWhiteBody).toEqual([255, 255, 255, 255]);
    expect(measured.whiteHeaderPixels).toBeGreaterThan(20);
    const labels = measured.texts.map(record => record.text);
    expect(labels.some(text => /^\d+$/.test(text))).toBe(true);
    for (const legend of tool === 'picker' ? ['Selector options', 'Your picks'] : ['National Dex', 'Yours']) expect(labels).toContain(legend);
    expect(labels.some(text => /Choices:|coverage:|selector-option reference/.test(text))).toBe(false);
    const parity = await page.locator('[data-export-preview-layer] img[src^="blob:"]').first().evaluate(async (el, plain) => {
      const native = el as HTMLImageElement;
      const old = new Image(); old.src = `data:image/png;base64,${plain.png}`; await old.decode();
      const a = document.createElement('canvas'), b = document.createElement('canvas'); a.width = b.width = plain.width - 12; a.height = b.height = plain.height;
      const first = a.getContext('2d')!, second = b.getContext('2d')!; first.drawImage(old, 0, 0); second.drawImage(native, 0, 0);
      const left = first.getImageData(0, 0, a.width, a.height).data, right = second.getImageData(0, 0, b.width, b.height).data;
      let changed = 0; for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) changed++;
      return { changedChannels: changed, width: a.width, height: a.height };
    }, plain);
    expect(parity.changedChannels).toBe(0);
    if (tool === 'picker') await page.getByTestId('favorites-export-stats').uncheck(); else await page.locator('[data-export-stats]').click();
    expect((await nativeImage(page, tool)).sha256).toBe(plain.sha256);
    await testInfo.attach(`${tool}-native-framing`, { body: JSON.stringify({ ...measured, plain: { width: plain.width, height: plain.height, sha256: plain.sha256 }, detailed: { width: detailed.width, height: detailed.height, sha256: detailed.sha256 }, parity }, null, 2), contentType: 'application/json' });
    await testInfo.attach(`${tool}-native-detailed`, { body: Buffer.from(detailed.png, 'base64'), contentType: 'image/png' });
    await testInfo.attach(`${tool}-export-flow`, { body: await page.screenshot(), contentType: 'image/png' });
  });
}

test('Picker charts and export settings show essential data without explanatory microcopy @viewport', async ({ page }, testInfo) => {
  await openStatsFlow(page, 'picker'); await nativeImage(page, 'picker');
  const settings = page.getByTestId('favorites-export-settings');
  await expect(settings).not.toContainText('257');
  await expect(page.getByTestId('favorites-export-stats')).toBeVisible();
  await expect(page.locator('[data-favorites-export-mode="full"]')).toBeVisible();
  await expect(page.locator('[data-favorites-export-mode="simplified"]')).toBeVisible();
  await page.keyboard.press('Escape'); await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  const dashboard = page.getByTestId('favorites-analytics'); await expect(dashboard).toBeVisible();
  const text = await dashboard.innerText();
  expect(text).not.toMatch(/Explore your favorite|Charts compare|Choices:|BST coverage:/);
  await expect(dashboard.locator('[data-favorite-chart]')).toHaveCount(5);
  await expect(dashboard.locator('[data-favorite-chart="bst"]')).toHaveAttribute('data-favorite-covered', '154');
  await expect(dashboard.locator('[data-favorite-chart="bst"]')).toHaveAttribute('data-favorite-excluded', '5');
  await expect(dashboard.locator('[data-favorite-chart=bst] [data-mean-marker]')).toHaveCount(2);
  const meanLabels = await dashboard.locator('[data-favorite-chart=bst] [data-mean-marker] text').allTextContents();
  expect(meanLabels.join(' ')).toContain('Your mean');
  await testInfo.attach('concise-analytics', { body: JSON.stringify({ text, settingsEssentialControls: ['Full grid', 'Summary', 'Show detailed stats'] }, null, 2), contentType: 'application/json' });
  await testInfo.attach('concise-analytics-screen', { body: await page.screenshot(), contentType: 'image/png' });
});


test('the stats title fits the narrower Dex sheet in all nine locales', async ({ page }, testInfo) => {
  test.setTimeout(180000);
  const reports: unknown[] = [];
  for (const lang of ['en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'zh-Hans', 'zh-Hant']) {
    await openStatsFlow(page, 'dex', lang);
    const plain = await nativeImage(page, 'dex'); await toggleStats(page, 'dex');
    await nativeImage(page, 'dex'); const measured = await framePixels(page, plain.width);
    expect(measured.headerGlyphs.length, lang).toBeGreaterThan(0);
    for (const glyph of measured.headerGlyphs) {
      expect(glyph.bounds.left, `${lang} ${glyph.text}`).toBeGreaterThanOrEqual(measured.statsX + 24);
      expect(glyph.bounds.right, `${lang} ${glyph.text}`).toBeLessThanOrEqual(measured.width - 24);
      expect(glyph.bounds.top, lang).toBeGreaterThanOrEqual(12);
      expect(glyph.bounds.bottom, lang).toBeLessThanOrEqual(62);
    }
    reports.push({ lang, width: measured.width, statsX: measured.statsX, statsWidth: measured.statsWidth, glyphs: measured.headerGlyphs });
  }
  await testInfo.attach('localized-stats-title-ink', { body: JSON.stringify(reports, null, 2), contentType: 'application/json' });
});
