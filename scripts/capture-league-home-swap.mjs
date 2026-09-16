#!/usr/bin/env node
/**
 * Drive league-home row drags and write whole-screen proof shots.
 *
 *   TAG=before BASE_URL=http://127.0.0.1:4173 node scripts/capture-league-home-swap.mjs
 *
 * TAG is baked into every filename so a second run cannot overwrite the first.
 */
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
const TAG = process.env.TAG || 'shot';
const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
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
  'electric', 'fire', 'water', 'grass', 'ghost', 'psychic',
  null,
  'ground', 'ice',
  null,
  'poison', 'dark', 'dragon', 'steel',
];
const NAMES = ['A', 'B', 'C', 'D', 'E', 'F', '', 'G', 'H', '', 'I', 'J', 'K', 'L'];
const MONS = [25, 6, 9, 3, 94, 65, null, 76, 131, null, 89, 197, 149, 208];

function leagueSeed() {
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
  const cards = Array.from({ length: 14 }, empty);
  for (let i = 0; i < 14; i++) {
    if (!NAMES[i]) continue;
    cards[i] = {
      ...empty(),
      type: TYPES[i],
      badgeName: NAMES[i],
      lines: [{ branch: [MONS[i]], boundaries: [1] }],
    };
  }
  return JSON.stringify({ state: { name: 'SwapProof', cards }, version: 1 });
}

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '1280', width: 1280, height: 800 },
];

const CASES = [
  { id: '1_empty', from: 5, to: 6, rest: true, mid: true, after: true },
  { id: '2_adjacent_down', from: 4, to: 5, rest: true, mid: true, after: true },
  { id: '3_adjacent_up', from: 5, to: 4, rest: true, mid: true, after: true },
  { id: '4_distant', from: 0, to: 5, rest: true, mid: true, after: true, via: 3, video: true },
  { id: '5_last_row', from: 0, to: 13, rest: true, mid: true, after: true, video: true },
  { id: '6_self', from: 0, to: 0, rest: true, mid: false, after: true },
  { id: '7_across_section', from: 7, to: 8, rest: true, mid: true, after: true },
  { id: '8_empty_source', from: 6, to: 5, rest: true, mid: true, after: true, emptySource: true },
];

async function mark(page, from, to) {
  await page.evaluate(({ from: a, to: b }) => {
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
  }, { from, to });
}

async function box(page, index) {
  await page.locator(`[data-testid="league-slot-${index}"]`).scrollIntoViewIfNeeded();
  const b = await page.locator(`[data-testid="league-slot-${index}"]`).boundingBox();
  if (!b) throw new Error(`missing slot ${index}`);
  return b;
}

async function seedAndOpen(page) {
  await page.addInitScript((raw) => {
    window.localStorage.setItem('league-builder', raw);
  }, leagueSeed());
  await page.goto(`${BASE_URL}/custom-gym-leader`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.waitForTimeout(400);
}

function writeShot(storeName, srcPath) {
  const storePath = join(STORE_DIR, storeName);
  const artifactName = storeName.replace(/-/g, '_');
  const artifactPath = join(ARTIFACT_DIR, artifactName);
  if (!existsSync(storePath)) copyFileSync(srcPath, storePath);
  if (!existsSync(artifactPath)) copyFileSync(srcPath, artifactPath);
  return { storePath, artifactPath };
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
    for (const vp of VIEWPORTS) {
      for (const c of CASES) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: 1,
        });
        const page = await context.newPage();
        await seedAndOpen(page);
        await mark(page, c.from, c.to);

        const prefix = `pr32_${vp.name}_${c.id}_${TAG}`;
        if (c.rest) {
          const tmp = join(STORE_DIR, `_${prefix}_rest.png`);
          await page.screenshot({ path: tmp, fullPage: false });
          written.push(writeShot(`${prefix}_rest.png`, tmp));
        }

        const fromBox = await box(page, c.from);
        const toBox = await box(page, c.to);
        const fx = fromBox.x + fromBox.width / 2;
        const fy = fromBox.y + fromBox.height / 2;
        const tx = toBox.x + toBox.width / 2;
        const ty = toBox.y + toBox.height / 2;

        if (c.emptySource) {
          await page.mouse.move(fx, fy);
          await page.mouse.down();
          await page.waitForTimeout(450);
          await page.mouse.move(tx, ty, { steps: 10 });
          await page.waitForTimeout(250);
          const tmp = join(STORE_DIR, `_${prefix}_mid.png`);
          await page.screenshot({ path: tmp, fullPage: false });
          written.push(writeShot(`${prefix}_mid.png`, tmp));
          const held = await page.locator('[data-drag-held]').count();
          await page.mouse.up();
          await page.waitForTimeout(250);
          const tmp2 = join(STORE_DIR, `_${prefix}_after.png`);
          await page.screenshot({ path: tmp2, fullPage: false });
          written.push(writeShot(`${prefix}_after.png`, tmp2));
          console.log(`${prefix} empty-source held=${held}`);
        } else if (c.from === c.to) {
          await page.mouse.move(fx, fy);
          await page.mouse.down();
          await page.waitForTimeout(350);
          await page.mouse.move(fx, fy + 12);
          await page.waitForTimeout(150);
          await page.mouse.move(fx, fy);
          await page.waitForTimeout(200);
          await page.mouse.up();
          await page.waitForTimeout(250);
          const tmp = join(STORE_DIR, `_${prefix}_after.png`);
          await page.screenshot({ path: tmp, fullPage: false });
          written.push(writeShot(`${prefix}_after.png`, tmp));
        } else {
          const viaIndex = c.via;
          await page.mouse.move(fx, fy);
          await page.mouse.down();
          await page.waitForTimeout(350);
          if (viaIndex !== undefined) {
            const viaBox = await box(page, viaIndex);
            await page.mouse.move(
              viaBox.x + viaBox.width / 2,
              viaBox.y + viaBox.height / 2,
              { steps: 12 },
            );
            await page.waitForTimeout(250);
            await mark(page, c.from, viaIndex);
            const tmpVia = join(STORE_DIR, `_${prefix}_mid_via.png`);
            await page.screenshot({ path: tmpVia, fullPage: false });
            written.push(writeShot(`${prefix}_mid_via.png`, tmpVia));
          }
          await page.mouse.move(tx, ty, { steps: 14 });
          await page.waitForTimeout(300);
          await mark(page, c.from, c.to);
          if (c.mid) {
            const tmp = join(STORE_DIR, `_${prefix}_mid.png`);
            await page.screenshot({ path: tmp, fullPage: false });
            written.push(writeShot(`${prefix}_mid.png`, tmp));
          }
          await page.mouse.up();
          await page.waitForTimeout(350);
          if (c.after) {
            const tmp = join(STORE_DIR, `_${prefix}_after.png`);
            await page.screenshot({ path: tmp, fullPage: false });
            written.push(writeShot(`${prefix}_after.png`, tmp));
          }
        }

        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  for (const w of written) console.log(`wrote ${w.artifactPath}`);
  console.log(`files ${written.length} tag=${TAG}`);
}

await main();
