import { expect, test } from '@playwright/test';

// index.html preloads the hub's largest phone screenshot. Its `imagesrcset`
// and `imagesizes` copy the shot in HomePage.tsx. If the two drift apart, a
// phone downloads the screenshot twice, or the preload stops counting.
const DEVICES = [
  { name: 'iPhone 390px 3x', width: 390, height: 844, dpr: 3, phone: true },
  { name: 'Android 412px 2.625x', width: 412, height: 915, dpr: 2.625, phone: true },
  { name: 'iPhone 375px 2x', width: 375, height: 667, dpr: 2, phone: true },
  { name: 'desktop 1280px 1x', width: 1280, height: 800, dpr: 1, phone: false },
  { name: 'desktop 1440px 2x', width: 1440, height: 900, dpr: 2, phone: false },
];

for (const device of DEVICES) {
  test(`the hub downloads its Pokédex screenshot once: ${device.name}`, async ({ browser, baseURL }, testInfo) => {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: device.dpr,
      isMobile: device.phone,
      hasTouch: device.phone,
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const fetched: string[] = [];
    page.on('request', (request) => {
      const name = new URL(request.url()).pathname.split('/').pop() ?? '';
      if (name.startsWith('tool-dex') && !name.startsWith('tool-dex-b')) fetched.push(name);
    });
    await page.goto('/?notme');
    const shot = page.getByRole('img', { name: /^Custom Pokédex Maker: a custom regional Pokédex in progress/ });
    await expect(shot).toHaveJSProperty('complete', true);
    const shown = await shot.evaluate((img: HTMLImageElement) => img.currentSrc.split('/').pop() ?? '');
    // Which request fetched it: the preload in the HTML ('link') or the image itself.
    const initiator = await page.evaluate(
      (name) =>
        (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).find((e) => e.name.endsWith(`/${name}`))?.initiatorType ?? 'none',
      shown,
    );
    await testInfo.attach('hub-shot-requests.json', {
      body: JSON.stringify({ device, fetched, shown, initiator }, null, 1),
      contentType: 'application/json',
    });
    expect(fetched).toEqual([shown]);
    expect(initiator).toBe(device.phone ? 'link' : 'img');
    await context.close();
  });
}
