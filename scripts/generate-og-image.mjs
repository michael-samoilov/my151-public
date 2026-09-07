#!/usr/bin/env node
/**
 * Renders the 1200x630 Open Graph images that og:image / twitter:image tags
 * point at. One image per page, so a shared link to the gym leader maker shows
 * a gym leader card, not the Pokédex grid.
 *
 * They are generated rather than hand-drawn so they stay in sync with the app's
 * own assets: the sprites come straight out of public/sprites/pokemon and the
 * colors and wordmark match src/index.css. Re-run with:
 *
 *   node scripts/generate-og-image.mjs            # every page
 *   node scripts/generate-og-image.mjs pokedex    # one page
 *   OG_OUT_DIR=/tmp/og node scripts/generate-og-image.mjs   # preview elsewhere
 *
 * Sprites and the Inter subset are inlined as data URIs so the render needs no
 * dev server and no network. Headless Chromium loads a single self-contained page.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.env.OG_OUT_DIR || join(root, 'public');

const WIDTH = 1200;
const HEIGHT = 630;

/**
 * One entry per page. `file` is the name under public/. `heading` is HTML so
 * the accent span can sit inside it. `sprites` is a 6x4 spread of Pokédex ids.
 */
const PAGES = {
  // The Pokédex builder keeps the historical file name because index.html and
  // every existing share of the site already point at it.
  pokedex: {
    file: 'og-image.png',
    heading: 'Build your own <span class="accent">Pokédex</span>',
    subtitle:
      'Pick your 151 favorites, arrange your personal regional dex, and compare your type distribution to the National Dex.',
    // Starters and their finals, the mascots, the birds, the pseudo-legendaries.
    // Reads as "Pokédex" at thumbnail size, which is how OG cards are seen.
    sprites: [
      1, 4, 7, 25, 39, 52,
      3, 6, 9, 133, 143, 94,
      65, 68, 76, 112, 130, 131,
      144, 145, 146, 149, 150, 54,
    ],
  },
  hub: {
    file: 'og-hub.png',
    heading: 'Custom Pokédex &amp; <span class="accent">Pokémon tools</span>',
    subtitle:
      'Build a custom Pokédex of your 151 favorites and design your own gym leaders, Elite Four and Champion. Free, in the browser.',
    // A cross-generation spread: one recognizable face per generation and type
    // family, so the image reads as "all of Pokémon", not "Gen 1".
    sprites: [
      25, 6, 150, 196, 248, 249,
      257, 384, 445, 448, 493, 571,
      635, 658, 700, 778, 792, 815,
      887, 906, 1007, 1008, 1024, 1025,
    ],
  },
  league: {
    file: 'og-gym-leader.png',
    heading: 'Build your own <span class="accent">Gym Leaders</span>',
    subtitle:
      'Give each leader a team, a badge and a type specialty, then build the Elite Four and Champion. Export every trainer as a card.',
    // Six aces per row, one row per "tier": gym leader signature Pokémon, then
    // Elite Four and Champion style powerhouses.
    sprites: [
      95, 121, 26, 45, 82, 65,
      94, 130, 208, 229, 373, 376,
      445, 448, 530, 612, 635, 706,
      149, 248, 461, 260, 887, 1000,
    ],
  },
};

function dataUri(relPath, mime) {
  return `data:${mime};base64,${readFileSync(join(root, relPath)).toString('base64')}`;
}

const interUri = dataUri(
  'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  'font/woff2',
);

function pageHtml({ heading, subtitle, sprites }) {
  const spriteTags = sprites
    .map((id) => {
      const uri = dataUri(`public/sprites/pokemon/${id}.png`, 'image/png');
      return `<div class="cell"><img src="${uri}" alt="" /></div>`;
    })
    .join('\n        ');

  return `<!doctype html>
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
      <h1>${heading}</h1>
      <div class="rule"></div>
      <p>${subtitle}</p>
      <div class="domain">my151.app</div>
    </div>
    <div class="grid">
        ${spriteTags}
    </div>
  </body>
</html>`;
}

const wanted = process.argv.slice(2);
const unknown = wanted.filter((name) => !(name in PAGES));
if (unknown.length) {
  console.error(`Unknown page(s): ${unknown.join(', ')}. Known: ${Object.keys(PAGES).join(', ')}`);
  process.exit(1);
}
const names = wanted.length ? wanted : Object.keys(PAGES);

// Prefer an explicitly-provided Chromium (set CHROMIUM_PATH when the local
// Playwright browser build doesn't match the pinned @playwright/test version, as
// on CI images that ship a single system Chromium).
const executablePath = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  mkdirSync(outDir, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  for (const name of names) {
    const spec = PAGES[name];
    await page.setContent(pageHtml(spec), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ type: 'png' });
    const out = join(outDir, spec.file);
    writeFileSync(out, png);
    console.log(`Wrote ${out} (${WIDTH}x${HEIGHT}, ${png.length} bytes)`);
  }
} finally {
  await browser.close();
}
