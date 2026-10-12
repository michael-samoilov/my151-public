// Reference captures for the holo foil rebuild: the foil workshop card at three frozen pointer poses.
// Usage: PW_MODULE=$PWD/node_modules/@playwright/test node docs/foil-rebuild/capture.cjs <base url> <out dir>
const { chromium } = require(process.env.PW_MODULE);
const fs = require('fs');
const [base, out] = process.argv.slice(2);
const POSES = { 'top-left': [0.15, 0.15], 'center-right': [0.85, 0.5], 'bottom-center': [0.5, 0.9] };
const VIEWS = {
  all: '',
  'no-holo': '[data-foil-layer=holographic],[data-foil-layer=holoRainbow]{display:none!important}',
  'rainbow-only': '[data-foil-layer=holographic],[data-foil-layer=pointLight],[data-foil-layer=iridescence]{display:none!important}',
  'shine-only': '[data-foil-layer=holoRainbow],[data-foil-layer=pointLight],[data-foil-layer=iridescence]{display:none!important}',
};
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable' });
  const meta = {};
  for (const [pose, [fx, fy]] of Object.entries(POSES)) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${base}/foil-workshop.html?sample=dex-full`);
    await page.waitForFunction(() => document.querySelector('[data-export-preview]')?.getAttribute('data-foil-maps') === '1', null, { timeout: 60000 });
    const hit = await page.locator('[data-export-tilt-hit]').boundingBox();
    const x = hit.x + hit.width * fx, y = hit.y + hit.height * fy;
    await page.mouse.move(hit.x + hit.width / 2, hit.y + hit.height / 2, { steps: 4 });
    await page.mouse.move(x, y, { steps: 12 });
    await page.waitForTimeout(1800);
    await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
    await page.waitForTimeout(200);
    const card = await page.locator('[data-export-preview]').boundingBox();
    meta[pose] = { card, state: await page.evaluate(() => { const p = document.querySelector('[data-export-preview]'); return ['data-foil-opacity', 'data-tilt-x', 'data-tilt-y'].map((a) => p.getAttribute(a)); }) };
    for (const [view, css] of Object.entries(VIEWS)) {
      const tag = css ? await page.addStyleTag({ content: css }) : null;
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${out}/${pose}-${view}.png`, clip: { x: Math.max(0, card.x - 20), y: Math.max(0, card.y - 20), width: card.width + 40, height: card.height + 40 } });
      if (tag) await tag.evaluate((n) => n.remove());
    }
    await page.close();
  }
  fs.writeFileSync(`${out}/meta.json`, JSON.stringify(meta, null, 1));
  await browser.close();
})();
