#!/usr/bin/env node
/**
 * Stitch existing pr32_row_* frames into four compact grids.
 *
 *   PLAYWRIGHT_CHROMIUM_PATH=/usr/local/bin/google-chrome node scripts/stitch-league-drag-grids.mjs
 */
import { existsSync, mkdirSync, readdirSync, copyFileSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const STORE_DIR =
  process.env.STORE_DIR ||
  '/cursor/stores/bc-90921133-efcd-47c7-a250-292e78a355ed/media/pr-32-drag';
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/opt/cursor/artifacts';
const CELL_W = 220;

const CHROMIUM_LAYOUTS = [
  ['chrome-linux', 'chrome'],
  ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
  ['chrome-win', 'chrome.exe'],
];

function resolveChromium() {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_PATH || process.env.CHROMIUM_PATH;
  if (explicit) return explicit;
  const browsersRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (browsersRoot) {
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
      /* fall through */
    }
  }
  for (const bin of ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome']) {
    if (existsSync(bin)) return bin;
  }
  return undefined;
}

function writeUnique(storeName, srcPath) {
  const storePath = join(STORE_DIR, storeName);
  const artifactName = storeName.replace(/-/g, '_');
  const artifactPath = join(ARTIFACT_DIR, artifactName);
  copyFileSync(srcPath, storePath);
  if (existsSync(artifactPath)) {
    throw new Error(`artifact exists, will not overwrite: ${artifactPath}`);
  }
  copyFileSync(srcPath, artifactPath);
  return artifactPath;
}

function labelFromName(name, total) {
  const m = /_(\d+)_([a-z0-9_]+)\.png$/.exec(name);
  if (!m) return name;
  const n = Number(m[1]);
  const slug = m[2].replace(/_/g, ' ').replace('pickup', 'pickup');
  const pretty = slug
    .replace(/^gym(\d+)/, (_, d) => `Gym ${d}`)
    .replace(/^e4 (\d+)/, (_, d) => `E4 ${d}`)
    .replace('champion', 'Champion')
    .replace('endgame', 'Endgame');
  return `${n}/${total} ${pretty}`;
}

function listFrames(id) {
  const files = readdirSync(ARTIFACT_DIR)
    .filter((f) => f.startsWith(`pr32_row_${id}_`) && f.endsWith('.png'))
    .sort();
  if (files.length === 0) throw new Error(`no frames for ${id} in ${ARTIFACT_DIR}`);
  return files.map((name) => ({
    name,
    path: join(ARTIFACT_DIR, name),
    label: labelFromName(name, files.length),
  }));
}

const DEMOS = [
  { id: 'all_occupied', title: 'All occupied · pickup Gym 1 · drag down every row', cols: 5 },
  { id: 'hole_middle', title: 'Hole in the middle · pickup Gym 5 · across the hole and after', cols: 5 },
  { id: 'occ_empty_occ', title: 'Occupied / empty / occupied · pickup Gym 1 · onto the hole and past', cols: 4 },
  { id: 'wrap_last', title: 'Wrap case · pickup Gym 1 · onto the last occupied row', cols: 5 },
];

async function stitchGrid(browser, demo) {
  const frames = listFrames(demo.id);
  const cols = demo.cols;
  const cellH = Math.round(CELL_W * 894 / 390);
  const figs = frames.map((f) => {
    const b64 = readFileSync(f.path).toString('base64');
    return `<figure style="margin:0;width:${CELL_W}px;background:#111">
      <div style="font:700 13px/1.2 ui-sans-serif,system-ui,sans-serif;color:#fff;padding:6px 6px 4px;background:#1c1917">${f.label}</div>
      <img src="data:image/png;base64,${b64}" width="${CELL_W}" height="${cellH}" style="display:block;width:${CELL_W}px;height:${cellH}px">
    </figure>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"></head>
    <body style="margin:0;background:#111;width:max-content">
      <div id="head" style="font:700 16px/1.3 ui-sans-serif,system-ui,sans-serif;color:#fff;padding:10px 12px;background:#991b1b;max-width:${cols * CELL_W + (cols - 1) * 8 + 16}px">
        ${demo.title}
        <div style="font:600 13px/1.35 ui-sans-serif,system-ui,sans-serif;margin-top:4px;color:#fecaca">
          Left to right, then next row. Red = pickup slot (stars stay). Blue = row under the pointer.
        </div>
      </div>
      <div id="grid" style="display:grid;grid-template-columns:repeat(${cols}, ${CELL_W}px);gap:8px;padding:8px 8px 12px">${figs}</div>
    </body></html>`;
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.setContent(html, { waitUntil: 'load' });
  const size = await page.evaluate(() => ({
    w: Math.ceil(document.body.scrollWidth),
    h: Math.ceil(document.body.scrollHeight),
  }));
  if (size.w > 2000) throw new Error(`grid too wide: ${size.w}px`);
  if (size.h > 2200) throw new Error(`grid too tall: ${size.h}px`);
  await page.setViewportSize({
    width: Math.max(size.w, 360),
    height: Math.max(size.h, 200),
  });
  const tmp = join(STORE_DIR, `_pr32_demo_${demo.id}.png`);
  await page.screenshot({ path: tmp, fullPage: true, type: 'png' });
  await page.close();
  return tmp;
}

async function main() {
  mkdirSync(STORE_DIR, { recursive: true });
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const executablePath = resolveChromium();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const written = [];
  try {
    for (const demo of DEMOS) {
      console.log(`grid ${demo.id}`);
      const tmp = await stitchGrid(browser, demo);
      written.push(writeUnique(`pr32_demo_${demo.id}.png`, tmp));
    }
  } finally {
    await browser.close();
  }
  for (const p of written) console.log(`wrote ${p}`);
}

await main();
