#!/usr/bin/env node
/** Historical hub renderer. Explicit compatibility command; no tool-route artwork. */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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
  hub: {
    file: 'og-hub.png',
    // "Pokémon fan tools", not "Pokémon tools": the latter is a TCG phrase
    // (docs/seo/HANDOFF.md, section 10).
    heading: 'Free <span class="accent">Pokémon fan tools</span>',
    subtitle:
      'Build a custom Pokédex, create gym leader cards, and pick your favorite Pokémon by type and generation. Free, in the browser.',
    // A cross-generation spread: one recognizable face per generation and type
    // family, so the image reads as "all of Pokémon", not "Gen 1".
    sprites: [
      25, 6, 150, 196, 248, 249,
      257, 384, 445, 448, 493, 571,
      635, 658, 700, 778, 792, 815,
      887, 906, 1007, 1008, 1024, 1025,
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

function pageHtml({ heading, subtitle, sprites, chart }) {
  let spriteTags = sprites
    .map((id) => {
      const uri = dataUri(`public/sprites/pokemon/${id}.png`, 'image/png');
      return `<div class="cell"><img src="${uri}" alt="" /></div>`;
    })
    .join('\n        ');
  if (chart) {
    const cells = sprites.map((id) => `<div class="cell"><img src="${dataUri(`public/sprites/pokemon/${id}.png`, 'image/png')}" alt="" /></div>`);
    spriteTags = `<span></span>${chart.types.map((type) => `<span class="chart-label">${type}</span>`).join('')}`;
    chart.generations.forEach((generation, row) => {
      spriteTags += `<span class="chart-label">${generation}</span>${cells.slice(row * chart.types.length, (row + 1) * chart.types.length).join('')}`;
    });
  }

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
      .chart { grid-template-columns: 54px repeat(3, 1fr); gap: 8px; }
      .chart-label { align-self: center; text-align: center; font-size: 16px; font-weight: 600; color: #d4d4d4; }
      .chart .cell img { width: 96px; height: 96px; }
      body.favorites h1 { font-size: 56px; }
    </style>
  </head>
  <body${chart ? ' class="favorites"' : ''}>
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
    <!-- The existing six-column OG montage intentionally fits sprites to thumbnail cells. -->
    <div class="grid${chart ? ' chart' : ''}" data-audit-scale="intended">
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

/**
 * Find a Chromium this machine actually has, without assuming a revision.
 *
 * An image that preinstalls browsers under PLAYWRIGHT_BROWSERS_PATH pins one
 * revision, and the pinned @playwright/test revision moves independently of it.
 * Once the two diverge, Playwright's own resolution fails on a path that was
 * never installed, and the browser CDN is blocked there, so
 * `npx playwright install` cannot repair it. So never name a revision. Ask, in
 * order: an explicit override, then the unversioned `chromium` symlink the
 * image maintains beside the revision directories, then the highest
 * `chromium-<digits>` directory. That pattern deliberately matches neither
 * chromium_headless_shell-* nor chromium-tip-of-tree-*. Undefined leaves
 * Playwright to resolve its own, which is right wherever browsers are
 * installed normally.
 *
 * PLAYWRIGHT_CHROMIUM_PATH is the name the rest of the repo uses; CHROMIUM_PATH
 * stays accepted because this script documented it first.
 *
 * playwright.config.ts and .claude/skills/verify-my151/harness/lib/engines.ts
 * carry the same lookup. All three stay separate: this script is plain ESM and
 * cannot import either TypeScript copy.
 */
const CHROMIUM_LAYOUTS = [
  ['chrome-linux', 'chrome'],
  ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
  ['chrome-win', 'chrome.exe'],
];

function resolveChromium() {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_PATH || process.env.CHROMIUM_PATH;
  if (explicit) return explicit;
  const browsersRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!browsersRoot) return undefined;
  try {
    const stable = join(browsersRoot, 'chromium');
    if (existsSync(stable) && statSync(stable).isFile()) return stable;
    const revisions = readdirSync(browsersRoot)
      .map((d) => /^chromium-(\d+)$/.exec(d))
      .filter((m) => m !== null)
      .sort((a, b) => Number(b[1]) - Number(a[1]));
    for (const match of revisions) {
      for (const layout of CHROMIUM_LAYOUTS) {
        const bin = join(browsersRoot, match[0], ...layout);
        if (existsSync(bin)) return bin;
      }
    }
  } catch {
    /* fall through to Playwright's own resolution */
  }
  return undefined;
}

const executablePath = resolveChromium() || '/usr/bin/chromium';
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
try {
  mkdirSync(outDir, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  for (const name of names) {
    const spec = PAGES[name];
    const html = pageHtml(spec);
    if (process.env.OG_HTML_OUT_DIR) {
      mkdirSync(process.env.OG_HTML_OUT_DIR, { recursive: true });
      writeFileSync(join(process.env.OG_HTML_OUT_DIR, `${name}.html`), html);
    }
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ type: 'png' });
    const out = join(outDir, spec.file);
    writeFileSync(out, png);
    console.log(`Wrote ${out} (${WIDTH}x${HEIGHT}, ${png.length} bytes)`);
  }
} finally {
  await browser.close();
}
