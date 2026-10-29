import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const spriteDir = resolve('public/sprites/pokemon');
const output = resolve('src/favorites/model/spriteInk.json');
const record = resolve('scripts/sprite-ink-measured.json');
const files = (await readdir(spriteDir)).filter((name) => name.endsWith('.png'));
const sprites = await Promise.all(files.map(async (name) => ({ id: name.slice(0, -4), bytes: await readFile(resolve(spriteDir, name)) })));
const hashes = Object.fromEntries(sprites.map(({ id, bytes }) => [id, createHash('md5').update(bytes).digest('hex').slice(0, 8)]));

if (process.argv.includes('--check')) {
  const ink = JSON.parse(await readFile(output, 'utf8'));
  const measured = existsSync(record) ? JSON.parse(await readFile(record, 'utf8')) : {};
  const problems = [];
  for (const [id, hash] of Object.entries(hashes)) {
    if (!(ink[id] > 0)) problems.push(`public/sprites/pokemon/${id}.png: has no ink value.`);
    else if (measured[id] !== hash) problems.push(`public/sprites/pokemon/${id}.png: changed after its ink value was measured (md5 ${measured[id] ?? 'not recorded'}, now ${hash}).`);
  }
  for (const id of Object.keys(ink)) if (!hashes[id]) problems.push(`public/sprites/pokemon/${id}.png: gone, but it still has an ink value.`);
  if (problems.length) {
    console.error(`sprite-ink: ${problems.length} problem(s)\n${problems.join('\n')}\nRun npm run sprites:measure, then commit src/favorites/model/spriteInk.json and scripts/sprite-ink-measured.json.`);
    process.exit(1);
  }
  console.log(`sprite-ink: ${files.length} sprite files, each with an ink value measured on its current bytes.`);
  process.exit(0);
}

const { chromium } = await import('playwright');
// Playwright pins one browser revision. The image's unversioned symlink
// outlives an upgrade to a revision it lacks (see playwright.config.ts).
const imageChromium = process.env.PLAYWRIGHT_BROWSERS_PATH && resolve(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium');
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (imageChromium && existsSync(imageChromium) ? imageChromium : undefined),
});

try {
  const page = await browser.newPage();
  const ink = {};

  for (let start = 0; start < sprites.length; start += 40) {
    const batch = sprites.slice(start, start + 40).map(({ id, bytes }) => ({ id, png: bytes.toString('base64') }));
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
  await writeFile(record, `${JSON.stringify(hashes, null, 1)}\n`);
  console.log(`Measured ${Object.keys(ink).length} sprites in ${output}`);
} finally {
  await browser.close();
}
