#!/usr/bin/env node
/**
 * Stitch live league-home drag previews into one filmstrip per layout.
 *
 *   BASE_URL=http://127.0.0.1:4183 node scripts/capture-league-drag-strips.mjs
 */
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:4183').replace(/\/$/, '');
const STORE_DIR =
  process.env.STORE_DIR ||
  '/cursor/stores/bc-90921133-efcd-47c7-a250-292e78a355ed/media/pr-32-drag';
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/opt/cursor/artifacts';

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

const TYPES = [
  'electric', 'fire', 'water', 'grass', 'ghost', 'psychic', 'rock',
  'ground', 'ice', 'poison', 'dark', 'dragon', 'steel', 'flying',
];
const NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];
const MONS = [25, 6, 9, 3, 94, 65, 76, 50, 131, 89, 197, 149, 208, 18];

function slotLabel(i) {
  if (i < 8) return `Gym ${i + 1}`;
  if (i < 12) return `Elite Four ${i - 7}`;
  if (i === 12) return 'Champion';
  return 'Endgame Boss';
}

function leagueSeed(emptySlots) {
  const empty = () => ({
    type: null,
    theme: '',
    lines: [],
    signatureSeat: null,
    tmMoveId: null,
    badgeName: '',
    legend: null,
    powerup: null,
    powerups: {},
    signatureId: null,
    partnerId: null,
    legends: [],
  });
  const holes = new Set(emptySlots);
  const cards = Array.from({ length: 14 }, empty);
  for (let i = 0; i < 14; i++) {
    if (holes.has(i)) continue;
    cards[i] = {
      ...empty(),
      type: TYPES[i],
      badgeName: NAMES[i],
      lines: [{ branch: [MONS[i]], boundaries: [1] }],
    };
  }
  return JSON.stringify({ state: { name: 'SwapProof', cards }, version: 1 });
}

async function mark(page, from, over) {
  await page.evaluate(({ from: a, over: b }) => {
    for (let i = 0; i < 14; i++) {
      const el = document.querySelector(`[data-testid="league-slot-${i}"]`);
      if (!el) continue;
      el.style.outline = '';
      el.style.outlineOffset = '';
    }
    const pickup = document.querySelector(`[data-testid="league-slot-${a}"]`);
    const target = document.querySelector(`[data-testid="league-slot-${b}"]`);
    if (pickup) {
      pickup.style.outline = '3px solid #ef4444';
      pickup.style.outlineOffset = '-3px';
    }
    if (target && target !== pickup) {
      target.style.outline = '3px solid #2563eb';
      target.style.outlineOffset = '-3px';
    }
  }, { from, over });
}

async function boxes(page) {
  await page.locator('[data-lg-league-root]').scrollIntoViewIfNeeded();
  const all = [];
  for (let i = 0; i < 14; i++) {
    const b = await page.locator(`[data-testid="league-slot-${i}"]`).boundingBox();
    if (!b) throw new Error(`missing slot ${i}`);
    all.push(b);
  }
  return all;
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

async function stitch(browser, frames, title, tmpPath) {
  const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
  const figs = frames.map((f, i) => {
    const b64 = Buffer.from(f.png).toString('base64');
    const w = f.w;
    return `<figure style="margin:0;width:${w}px;background:#111">
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#1c1917">
        <span style="flex:0 0 auto;font:700 13px/1.2 ui-sans-serif,system-ui,sans-serif;color:#fff;background:#991b1b;padding:4px 8px;border-radius:4px">${i + 1}/${frames.length}</span>
        <span style="font:700 13px/1.25 ui-sans-serif,system-ui,sans-serif;color:#fff">${f.caption}</span>
      </div>
      <img src="data:image/png;base64,${b64}" width="${w}" height="${f.h}" style="display:block">
    </figure>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"></head>
    <body style="margin:0;background:#111;width:max-content">
      <div id="head" style="font:700 16px/1.3 ui-sans-serif,system-ui,sans-serif;color:#fff;padding:12px 12px 10px;background:#991b1b">
        ${title}
        <div style="font:600 13px/1.35 ui-sans-serif,system-ui,sans-serif;margin-top:6px;color:#fecaca">
          Red outline = pickup slot (stars stay here). Blue = row under the pointer. Only those two faces should change.
        </div>
      </div>
      <div id="strip" style="display:flex;flex-direction:column;gap:10px;padding:10px 10px 14px">${figs}</div>
    </body></html>`;
  await page.setContent(html, { waitUntil: 'load' });
  const size = await page.evaluate(() => {
    const w = Math.ceil(document.body.scrollWidth);
    const h = Math.ceil(document.body.scrollHeight);
    return { w, h };
  });
  await page.setViewportSize({
    width: Math.min(Math.max(size.w, 360), 16000),
    height: Math.min(Math.max(size.h, 200), 16000),
  });
  await page.screenshot({ path: tmpPath, fullPage: true, type: 'png' });
  await page.close();
}

const STRIPS = [
  {
    id: 'all_occupied',
    title: 'All occupied · pickup Gym 1 · drag down every row',
    empty: [],
    from: 0,
    path: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    viewports: [
      { name: '390', width: 390, height: 900 },
      { name: '1280', width: 1280, height: 900 },
    ],
  },
  {
    id: 'hole_middle',
    title: 'One hole (Gym 7 empty) · pickup Gym 5 · across the hole and after',
    empty: [6],
    from: 4,
    path: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    viewports: [{ name: '390', width: 390, height: 900 }],
  },
  {
    id: 'occ_empty_occ',
    title: 'Occupied / empty / occupied · pickup Gym 1 · onto the hole and past it',
    empty: [1],
    from: 0,
    path: [0, 1, 2, 3, 4, 5, 6],
    viewports: [{ name: '390', width: 390, height: 900 }],
  },
  {
    id: 'wrap_last',
    title: 'Wrap case · pickup Gym 1 · every row down to the last occupied',
    empty: [],
    from: 0,
    path: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    viewports: [{ name: '390', width: 390, height: 900 }],
  },
];

async function captureStrip(browser, spec, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.addInitScript((raw) => {
    window.localStorage.setItem('league-builder', raw);
  }, leagueSeed(spec.empty));
  await page.goto(`${BASE_URL}/custom-gym-leader`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.waitForTimeout(500);

  const slotBoxes = await boxes(page);
  const fromBox = slotBoxes[spec.from];
  const fx = fromBox.x + fromBox.width / 2;
  const fy = fromBox.y + fromBox.height / 2;
  await page.mouse.move(fx, fy);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.move(fx, fy + 10);
  await page.waitForTimeout(350);

  const frames = [];
  for (const over of spec.path) {
    const overBox = slotBoxes[over];
    await page.mouse.move(
      overBox.x + overBox.width / 2,
      overBox.y + overBox.height / 2,
      { steps: 10 },
    );
    await page.waitForTimeout(280);
    await mark(page, spec.from, over);
    const png = await page.locator('[data-lg-league-root]').screenshot({ type: 'png' });
    const cap = over === spec.from
      ? `${slotLabel(over)} pickup`
      : `pointer on ${slotLabel(over)}`;
    frames.push({ png, caption: cap, w: 0, h: 0 });
  }
  await page.mouse.up();

  const sized = await Promise.all(frames.map(async (f) => {
    const dim = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      return { w: img.naturalWidth, h: img.naturalHeight };
    }, Buffer.from(f.png).toString('base64'));
    return { ...f, w: dim.w, h: dim.h };
  }));

  await context.close();
  return sized;
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
    for (const spec of STRIPS) {
      for (const vp of spec.viewports) {
        console.log(`strip ${spec.id} ${vp.name}`);
        const frames = await captureStrip(browser, spec, vp);
        const tmp = join(STORE_DIR, `_pr32_film_${spec.id}_${vp.name}.png`);
        await stitch(browser, frames, spec.title, tmp);
        const name = `pr32_film_${spec.id}_${vp.name}.png`;
        written.push(writeUnique(name, tmp));
      }
    }
  } finally {
    await browser.close();
  }
  for (const p of written) console.log(`wrote ${p}`);
}

await main();
