import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const spriteDir = resolve('public/sprites/pokemon');
const output = resolve('src/favorites/model/spriteInk.json');
const files = (await readdir(spriteDir)).filter((name) => name.endsWith('.png'));
const browser = await chromium.launch();

try {
  const page = await browser.newPage();
  const ink = {};

  for (let start = 0; start < files.length; start += 40) {
    const batch = await Promise.all(files.slice(start, start + 40).map(async (name) => ({
      id: name.slice(0, -4),
      png: (await readFile(resolve(spriteDir, name))).toString('base64'),
    })));
    const measured = await page.evaluate(async (sprites) => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas 2D is unavailable');

      return Promise.all(sprites.map(async ({ id, png }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${png}`;
        await image.decode();
        canvas.width = image.width;
        canvas.height = image.height;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let radius = 0;
        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = 0; x < canvas.width; x += 1) {
            if (pixels[(y * canvas.width + x) * 4 + 3] <= 8) continue;
            radius = Math.max(radius,
              Math.abs(x + 0.5 - canvas.width / 2) / canvas.width,
              Math.abs(y + 0.5 - canvas.height / 2) / canvas.height);
          }
        }
        return [id, Math.round(radius * 2000) / 1000];
      }));
    }, batch);
    for (const [id, diameter] of measured) ink[id] = diameter;
  }

  await writeFile(output, `${JSON.stringify(ink)}\n`);
  console.log(`Measured ${Object.keys(ink).length} sprites in ${output}`);
} finally {
  await browser.close();
}
