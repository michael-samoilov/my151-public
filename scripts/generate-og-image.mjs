#!/usr/bin/env node
/**
 * Renders public/og-image.png (1200x630) — the image every og:image / twitter:image
 * tag in index.html points at.
 *
 * It is generated rather than hand-drawn so it stays in sync with the app's own
 * assets: the sprites come straight out of public/sprites/pokemon and the type
 * colors/wordmark match src/index.css. Re-run with:
 *
 *   node scripts/generate-og-image.mjs
 *
 * Sprites and the Inter subset are inlined as data URIs so the render needs no
 * dev server and no network — headless Chromium loads a single self-contained page.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const WIDTH = 1200;
const HEIGHT = 630;

// A 6x4 spread of instantly-recognizable Gen 1 sprites — starters and their
// finals, the mascots, the birds, the pseudo-legendaries. Reads as "Pokédex" at
// thumbnail size, which is how OG cards are actually seen.
const SPRITE_IDS = [
  1, 4, 7, 25, 39, 52,
  3, 6, 9, 133, 143, 94,
  65, 68, 76, 112, 130, 131,
  144, 145, 146, 149, 150, 54,
];

function dataUri(relPath, mime) {
  return `data:${mime};base64,${readFileSync(join(root, relPath)).toString('base64')}`;
}

const interUri = dataUri(
  'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  'font/woff2',
);

const spriteTags = SPRITE_IDS.map((id) => {
  const uri = dataUri(`public/sprites/pokemon/${id}.png`, 'image/png');
  return `<div class="cell"><img src="${uri}" alt="" /></div>`;
}).join('\n        ');

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      @font-face {
        font-family: 'InterOG';
        src: url('${interUri}') format('woff2');
        font-weight: 100 900;
        font-display: block;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        width: ${WIDTH}px;
        height: ${HEIGHT}px;
        display: flex;
        align-items: center;
        gap: 56px;
        padding: 64px;
        background: #0a0a0a;
        background-image:
          radial-gradient(circle at 88% 18%, rgba(220, 38, 38, 0.22), transparent 58%),
          radial-gradient(circle at 4% 92%, rgba(99, 144, 240, 0.16), transparent 55%);
        font-family: 'InterOG', system-ui, sans-serif;
        color: #fafafa;
        overflow: hidden;
      }
      .left { display: flex; flex-direction: column; width: 520px; flex: none; }
      .brand { display: flex; align-items: center; gap: 14px; margin-bottom: 30px; }
      .brand svg { width: 46px; height: 46px; }
      .brand .wordmark { font-size: 34px; font-weight: 700; letter-spacing: -0.02em; }
      h1 {
        font-size: 62px;
        font-weight: 700;
        line-height: 1.04;
        letter-spacing: -0.035em;
      }
      h1 .accent { color: #f87171; }
      .rule { width: 76px; height: 5px; border-radius: 999px; background: #dc2626; margin: 28px 0; }
      p { font-size: 24px; line-height: 1.42; color: #a3a3a3; }
      .domain { margin-top: 34px; font-size: 21px; font-weight: 600; color: #d4d4d4; letter-spacing: 0.01em; }

      .grid {
        flex: 1;
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: 10px;
      }
      .cell {
        aspect-ratio: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.045);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .cell img {
        width: 82%;
        height: 82%;
        object-fit: contain;
        /* Sprites are 96px pixel art; nearest-neighbor keeps them crisp when scaled. */
        image-rendering: pixelated;
      }
    </style>
  </head>
  <body>
    <div class="left">
      <div class="brand">
        <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
          <circle cx="16" cy="16" r="15" fill="#fafafa" stroke="#dc2626" stroke-width="1.5"/>
          <path d="M2 16 A14 14 0 0 1 30 16" fill="#dc2626"/>
          <line x1="2" y1="16" x2="30" y2="16" stroke="#fafafa" stroke-width="2"/>
          <circle cx="16" cy="16" r="4.5" fill="#fafafa" stroke="#dc2626" stroke-width="2"/>
        </svg>
        <span class="wordmark">my151</span>
      </div>
      <h1>Build your own <span class="accent">Pokédex</span></h1>
      <div class="rule"></div>
      <p>Pick your 151 favorites, arrange your personal regional dex, and compare your type coverage to the national dex.</p>
      <div class="domain">my151.app</div>
    </div>
    <div class="grid">
        ${spriteTags}
    </div>
  </body>
</html>`;

/**
 * Find a Chromium this machine actually has.
 *
 * An image that preinstalls one revision under PLAYWRIGHT_BROWSERS_PATH breaks
 * Playwright's own resolution as soon as the pinned @playwright/test revision
 * moves ahead of it, and the browser CDN is blocked there, so the usual
 * `npx playwright install` repair is unavailable. Read the directory instead of
 * trusting the revision. PLAYWRIGHT_CHROMIUM_PATH overrides; CHROMIUM_PATH stays
 * accepted because this script documented it first. Undefined means "let
 * Playwright resolve its own", which is right wherever the browsers are
 * installed normally.
 *
 * playwright.config.ts and .claude/skills/verify-my151/harness/lib/engines.ts
 * carry the same logic. All three stay separate: this script is plain ESM and
 * cannot import either of the TypeScript copies.
 */
function resolveChromium() {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_PATH || process.env.CHROMIUM_PATH;
  if (explicit) return explicit;
  const browsersRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!browsersRoot) return undefined;
  try {
    const dir = readdirSync(browsersRoot).find((d) => d.startsWith('chromium-'));
    if (dir) {
      const bin = join(browsersRoot, dir, 'chrome-linux', 'chrome');
      if (existsSync(bin)) return bin;
    }
  } catch {
    /* fall through to Playwright's own resolution */
  }
  return undefined;
}

const executablePath = resolveChromium();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: 'png' });
  writeFileSync(join(root, 'public/og-image.png'), png);
  console.log(`Wrote public/og-image.png (${WIDTH}x${HEIGHT}, ${png.length} bytes)`);
} finally {
  await browser.close();
}
