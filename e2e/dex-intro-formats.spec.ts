import { expect, test } from './support/test';

const isShot = (url: string) => /\/assets\/shot-(45|95-outlines|151-stats)-/.test(url);

test.describe('intro format selection @viewport', () => {
  for (const format of ['avif', 'webp'] as const) {
    test(`downloads only ${format}, including its first-image preload`, async ({ page }, testInfo) => {
      if (format === 'webp') {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setDisabledImageTypes', { imageTypes: ['avif'] });
        // platform: CDP disables picture source selection but still reports AVIF preloads as supported, so the test models the missing MIME support.
        await page.route('**/pokedex-builder?notme', async route => {
          const response = await route.fetch();
          const html = await response.text();
          expect(html).toMatch(/id="p151-intro-shot"[^>]*type="image\/avif"/);
          await route.fulfill({ response, body: html.replace('type="image/avif"', 'type="image/x-avif-disabled"') });
        });
      }
      const requests: string[] = [];
      page.on('request', request => { if (isShot(request.url())) requests.push(request.url()); });
      await page.goto('/pokedex-builder?notme');
      const images = page.locator('img[src*="/shot-"]');
      await expect(images).toHaveCount(3);
      await expect.poll(() => images.evaluateAll(elements => elements.every(element => {
        const image = element as HTMLImageElement;
        return image.complete && image.naturalWidth > 0;
      }))).toBe(true);
      const selected = await images.evaluateAll(elements => elements.map(element => {
        const image = element as HTMLImageElement;
        return { url: image.currentSrc, width: image.naturalWidth, height: image.naturalHeight };
      }));
      await testInfo.attach('selected-format.json', { body: JSON.stringify({ format, requests, selected }), contentType: 'application/json' });
      await testInfo.attach('intro-format.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      expect(requests).toHaveLength(3);
      expect(new Set(requests).size).toBe(3);
      expect(requests.every(url => url.endsWith(`.${format}`))).toBe(true);
      expect(selected.every(image => image.url.endsWith(`.${format}`))).toBe(true);
      expect(selected.map(image => [image.width, image.height])).toEqual([[390, 620], [348, 620], [555, 653]]);
    });
  }
});

for (const [name, seed] of [
  ['dismissed intro', { 'p151-intro-seen': '1' }],
  ['saved Dex', { 'personal-151-pokedex-v3': JSON.stringify({ state: { sections: { starter: [1, 4, 7] } }, version: 10 }) }],
] as const) {
  test(`${name} downloads no intro format`, async ({ page }, testInfo) => {
    await page.addInitScript(entries => {
      for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
    }, seed);
    const requests: string[] = [];
    page.on('request', request => { if (isShot(request.url())) requests.push(request.url()); });
    await page.goto('/pokedex-builder?notme');
    await expect(page.locator('[data-section-id]').first()).toBeVisible();
    await page.waitForTimeout(500);
    await testInfo.attach('unused-formats.json', { body: JSON.stringify({ requests }), contentType: 'application/json' });
    expect(requests).toEqual([]);
  });
}
