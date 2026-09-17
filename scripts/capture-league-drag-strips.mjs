#!/usr/bin/env node
/**
 * Write one ~390-wide PNG per live league-home drag preview state.
 *
 *   BASE_URL=http://127.0.0.1:4183 node scripts/capture-league-drag-strips.mjs
 */
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:4183').replace(/\/$/, '');
const STORE_DIR =
  process.env.STORE_DIR ||
  '/cursor/stores/bc-90921133-efcd-47c7-a250-292e78a355ed/media/pr-32-drag';
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/opt/cursor/artifacts';
const FRAME_W = 390;

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

function slotSlug(i) {
  if (i < 8) return `gym${i + 1}`;
  if (i < 12) return `e4_${i - 7}`;
  if (i === 12) return 'champion';
  return 'endgame';
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

async function paintFrame(browser, png, caption, tmpPath) {
  const page = await browser.newPage({ viewport: { width: FRAME_W, height: 200 } });
  const b64 = Buffer.from(png).toString('base64');
  const html = `<!doctype html><html><head><meta charset="utf-8"></head>
    <body style="margin:0;width:${FRAME_W}px;background:#111">
      <div style="font:700 13px/1.3 ui-sans-serif,system-ui,sans-serif;color:#fff;background:#991b1b;padding:8px 10px">
        ${caption}
      </div>
      <img src="data:image/png;base64,${b64}" width="${FRAME_W}" style="display:block;width:${FRAME_W}px;height:auto">
    </body></html>`;
  await page.setContent(html, { waitUntil: 'load' });
  const h = await page.evaluate(() => Math.ceil(document.body.scrollHeight));
  if (h > 1600) throw new Error(`frame too tall: ${h}px`);
  await page.setViewportSize({ width: FRAME_W, height: Math.max(h, 200) });
  await page.screenshot({ path: tmpPath, fullPage: false, type: 'png' });
  await page.close();
}

const STRIPS = [
  {
    id: 'all_occupied',
    title: 'All occupied · pickup Gym 1',
    empty: [],
    from: 0,
    path: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  },
  {
    id: 'hole_middle',
    title: 'Hole at Gym 7 · pickup Gym 5',
    empty: [6],
    from: 4,
    path: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  },
  {
    id: 'occ_empty_occ',
    title: 'Occupied / empty / occupied · pickup Gym 1',
    empty: [1],
    from: 0,
    path: [0, 1, 2, 3, 4, 5, 6],
  },
  {
    id: 'wrap_last',
    title: 'Wrap case · pickup Gym 1 onto last occupied',
    empty: [],
    from: 0,
    path: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  },
];

async function captureFrames(browser, spec) {
  const context = await browser.newContext({
    viewport: { width: FRAME_W, height: 844 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.addInitScript((raw) => {
    window.localStorage.setItem('league-builder', raw);
  }, leagueSeed(spec.empty));
  await page.goto(`${BASE_URL}/custom-gym-leader`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const freezeEl = (el) => {
      el.scrollTop = 0;
      el.scrollLeft = 0;
      const stop = () => {
        el.scrollTop = 0;
        el.scrollLeft = 0;
      };
      el.addEventListener('scroll', stop, true);
    };
    freezeEl(document.documentElement);
    freezeEl(document.body);
    for (const el of document.querySelectorAll('[data-lg-viewport]')) {
      el.style.overflow = 'hidden';
      freezeEl(el);
    }
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0);
  });

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
  for (let i = 0; i < spec.path.length; i++) {
    const over = spec.path[i];
    const overBox = slotBoxes[over];
    await page.mouse.move(
      overBox.x + overBox.width / 2,
      overBox.y + overBox.height / 2,
      { steps: 10 },
    );
    await page.waitForTimeout(280);
    await mark(page, spec.from, over);
    const png = await page.screenshot({ type: 'png', fullPage: false });
    const step = `${i + 1}/${spec.path.length}`;
    const where = over === spec.from
      ? `${slotLabel(over)} pickup`
      : `pointer on ${slotLabel(over)}`;
    const slug = over === spec.from
      ? `${slotSlug(over)}_pickup`
      : slotSlug(over);
    frames.push({
      png,
      nn: String(i + 1).padStart(2, '0'),
      slug,
      alt: `${spec.title}. ${step}. ${where}. Red pickup, blue pointer.`,
      caption: `${spec.title} · ${step} · ${where} · red pickup · blue pointer`,
    });
  }
  await page.mouse.up();
  await context.close();
  return frames;
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
      console.log(`layout ${spec.id}`);
      const frames = await captureFrames(browser, spec);
      for (const f of frames) {
        const name = `pr32_row_${spec.id}_${f.nn}_${f.slug}.png`;
        const tmp = join(STORE_DIR, `_${name}`);
        await paintFrame(browser, f.png, f.caption, tmp);
        const path = writeUnique(name, tmp);
        written.push({ path, alt: f.alt, layout: spec.id, nn: f.nn });
      }
    }
  } finally {
    await browser.close();
  }
  const manifest = join(STORE_DIR, 'pr32_frame_manifest.json');
  writeFileSync(manifest, `${JSON.stringify(written, null, 2)}\n`);
  for (const w of written) console.log(`IMG ${w.alt} :: ${w.path}`);
}

await main();
